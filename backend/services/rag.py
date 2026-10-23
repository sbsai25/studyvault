import json
import logging
import os
import re
import time
from typing import List

from dotenv import load_dotenv
from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from sqlalchemy.orm import Session

from backend.models.chunk import EMBEDDING_DIMENSIONS, Chunk

load_dotenv()

logger = logging.getLogger(__name__)

# Each model has its own free-tier quota, so this can be switched in .env
GENERATION_MODEL = os.getenv("GEMINI_MODEL") or "gemini-3.5-flash-lite"
EMBEDDING_MODEL = "gemini-embedding-2"

# Initialize Gemini
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))


class AIServiceError(Exception):
    """Raised when a Gemini call fails or returns unusable output.

    The message is for server logs only; the API returns a generic 502.
    """


GEMINI_ATTEMPTS = 3
GEMINI_RETRY_BASE_SECONDS = 1.0  # waits 1s, then 2s
# A per-minute quota tells us how long until it resets (e.g. "32s"); wait that
# long if it's at most this, so large uploads get through on the free tier
MAX_QUOTA_WAIT_SECONDS = 60


def _is_transient(error: Exception) -> bool:
    """Overloaded (5xx) or rate-limited (429) responses are worth retrying."""
    return isinstance(error, genai_errors.ServerError) or (
        isinstance(error, genai_errors.APIError) and error.code == 429
    )


def _quota_retry_delay(error: Exception) -> float | None:
    """The wait a 429 asks for, or infinity for a daily quota; None if unknown."""
    body = getattr(error, "details", None)
    if getattr(error, "code", None) != 429 or not isinstance(body, dict):
        return None
    delay = None
    for detail in body.get("error", {}).get("details", []):
        for violation in detail.get("violations", []):
            if "PerDay" in violation.get("quotaId", ""):
                return float("inf")  # resets at midnight Pacific; waiting won't help
        if detail.get("@type", "").endswith("RetryInfo"):
            try:
                delay = float(detail.get("retryDelay", "").rstrip("s"))
            except ValueError:
                pass
    return delay


def _call_gemini(fn, **kwargs):
    """Calls a Gemini SDK method, retrying transient errors with backoff."""
    for attempt in range(1, GEMINI_ATTEMPTS + 1):
        try:
            return fn(**kwargs)
        except Exception as e:
            if attempt == GEMINI_ATTEMPTS or not _is_transient(e):
                raise
            delay = GEMINI_RETRY_BASE_SECONDS * 2 ** (attempt - 1)
            requested = _quota_retry_delay(e)
            if requested is not None:
                if requested > MAX_QUOTA_WAIT_SECONDS:
                    raise
                delay = max(delay, requested)
            logger.warning("Gemini call failed (%s), retrying in %.0fs (attempt %d/%d)",
                           getattr(e, "code", type(e).__name__), delay, attempt, GEMINI_ATTEMPTS)
            time.sleep(delay)


# Texts sent per embedding request (the API's batch limit), so a large
# document takes a few requests instead of one per chunk
EMBED_BATCH_SIZE = 100


def get_embeddings(texts: List[str]) -> List[List[float]]:
    """Generate document embeddings for the given texts using Gemini, in order."""
    embeddings = []
    for start in range(0, len(texts), EMBED_BATCH_SIZE):
        batch = texts[start:start + EMBED_BATCH_SIZE]
        try:
            result = _call_gemini(
                client.models.embed_content,
                model=EMBEDDING_MODEL,
                # One Content per text: gemini-embedding-2 merges a plain list
                # of strings into a single embedding
                contents=[types.Content(parts=[types.Part(text=t)]) for t in batch],
                config=types.EmbedContentConfig(
                    task_type="RETRIEVAL_DOCUMENT",
                    output_dimensionality=EMBEDDING_DIMENSIONS,
                ),
            )
            values = [e.values for e in result.embeddings]
        except Exception as e:
            raise AIServiceError(f"Embedding request failed: {e}") from e
        if len(values) != len(batch):
            raise AIServiceError(f"Expected {len(batch)} embeddings, got {len(values)}")
        embeddings.extend(values)
    return embeddings


def embed_chunks(chunks: List[Chunk]):
    """Embeds each chunk's content and stores the vector on the row.

    The caller adds the rows to the session and commits.
    """
    vectors = get_embeddings([c.content for c in chunks])
    for c, vector in zip(chunks, vectors):
        c.embedding = vector


def get_query_embedding(query: str) -> List[float]:
    """Generate an embedding for a search query using Gemini."""
    try:
        result = _call_gemini(
            client.models.embed_content,
            model=EMBEDDING_MODEL,
            contents=query,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY",
                output_dimensionality=EMBEDDING_DIMENSIONS,
            ),
        )
        return result.embeddings[0].values
    except Exception as e:
        raise AIServiceError(f"Query embedding failed: {e}") from e


def search_chunks(
    query: str,
    user_id: int,
    db: Session,
    top_k: int = 4,
    document_id: int | None = None,
) -> List[dict]:
    """
    Searches for the most relevant chunks for a query,
    scoped to the user and optionally to one of their documents.

    Exact cosine-distance search (no vector index): each user's chunks are
    few enough that scanning them is fast.
    """

    query_embedding = get_query_embedding(query)

    q = db.query(Chunk).filter(Chunk.user_id == user_id, Chunk.embedding.isnot(None))
    if document_id is not None:
        q = q.filter(Chunk.document_id == document_id)

    rows = q.order_by(Chunk.embedding.cosine_distance(query_embedding)).limit(top_k).all()

    return [
        {
            "id": str(c.id),
            "text": c.content,
            "metadata": {
                "user_id": c.user_id,
                "document_id": c.document_id,
                "chunk_index": c.chunk_index,
            },
        }
        for c in rows
    ]


HISTORY_MESSAGE_CHARS = 2000


def generate_answer(
    query: str,
    context_chunks: List[dict],
    history: List[dict] | None = None,
) -> str:
    """
    Generates an answer using Gemini given the retrieved context.

    `history` is the earlier part of the conversation, oldest first, as
    [{"role": "user" | "assistant", "content": str}], so follow-up questions
    ("what about the second one?") can be understood.
    """

    context_text = "\n\n---\n\n".join(
        [
            f"Source Document ID: "
            f"{c['metadata'].get('document_id', 'Unknown')}\n"
            f"{c['text']}"
            for c in context_chunks
        ]
    )

    history_block = ""
    if history:
        lines = [
            f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content'][:HISTORY_MESSAGE_CHARS]}"
            for m in history
        ]
        history_block = "Conversation so far:\n" + "\n".join(lines) + "\n\n"

    prompt = f"""You are a helpful AI study assistant.

Use the following retrieved context from the user's study materials
to answer their question. Use the conversation so far only to understand
what the question refers to; base the answer on the context.

If the context doesn't contain the answer, say:
"I couldn't find the answer in your uploaded materials."

{history_block}Context:
{context_text}

Question:
{query}

Answer:"""

    try:
        response = _call_gemini(
            client.models.generate_content,
            model=GENERATION_MODEL,
            contents=prompt
        )
    except Exception as e:
        raise AIServiceError(f"Answer generation failed: {e}") from e

    if not response.text:
        raise AIServiceError("Answer generation returned no text")
    return response.text


def _generate_json(prompt: str) -> list:
    """Calls Gemini in JSON mode and returns the parsed list of items.

    Accepts either a bare JSON array or an object wrapping a single array
    (e.g. {"questions": [...]}). Raises AIServiceError otherwise.
    """
    try:
        response = _call_gemini(
            client.models.generate_content,
            model=GENERATION_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            )
        )
        data = json.loads(response.text)
    except Exception as e:
        raise AIServiceError(f"JSON generation failed: {e}") from e

    if isinstance(data, dict):
        lists = [v for v in data.values() if isinstance(v, list)]
        if len(lists) == 1:
            data = lists[0]
    if not isinstance(data, list):
        raise AIServiceError(f"Expected a JSON array, got {type(data).__name__}")
    return data


def _clean_str(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def generate_flashcards(context: str, count: int | None = None) -> List[dict]:
    """Returns [{question, answer}]. Malformed items are dropped."""
    if count:
        how_many = f"exactly {count}"
    else:
        how_many = ("between 5 and 15. Base the number of flashcards on the "
                    "length and density of the content")
    prompt = f"""You are a helpful AI study assistant.
Create {how_many} important Q&A flashcards based on the following text.
Return ONLY a JSON array of objects with 'question' and 'answer' keys.

Text:
{context}
"""
    cards = []
    for item in _generate_json(prompt):
        if not isinstance(item, dict):
            continue
        question, answer = _clean_str(item.get("question")), _clean_str(item.get("answer"))
        if question and answer:
            cards.append({"question": question, "answer": answer})
    return cards


BLANK = "____"


def generate_fill_blanks(context: str, count: int = 10) -> List[dict]:
    """Returns [{sentence, answer, accepted_answers, hint}].

    Each sentence must contain exactly one blank (any run of 3+ underscores
    is normalised to "____"); other items are dropped.
    """
    prompt = f"""You are a helpful AI study assistant.
Create {count} fill-in-the-blank questions based on the following text.
For each one, take an important sentence or fact and replace ONE key term
(a word or short phrase) with "____".
Return ONLY a JSON array of objects. Each object should have:
- 'sentence' (containing exactly one "____")
- 'answer' (the exact term that was removed)
- 'accepted_answers' (array of other correct forms, e.g. synonyms or abbreviations; may be empty)
- 'hint' (a short clue that does not give the answer away)

Text:
{context}
"""
    items = []
    for item in _generate_json(prompt):
        if not isinstance(item, dict):
            continue
        sentence = re.sub(r"_{3,}", BLANK, _clean_str(item.get("sentence")))
        answer = _clean_str(item.get("answer"))
        if sentence.count(BLANK) != 1 or not answer:
            continue
        raw_accepted = item.get("accepted_answers")
        accepted = []
        if isinstance(raw_accepted, list):
            for a in raw_accepted:
                a = _clean_str(a)
                if a and a.casefold() != answer.casefold() and a not in accepted:
                    accepted.append(a)
        items.append({
            "sentence": sentence,
            "answer": answer,
            "accepted_answers": accepted,
            "hint": _clean_str(item.get("hint")) or None,
        })
    return items[:count]

def generate_conversation_title(query: str) -> str:
    """
    Generates a short, concise conversation title based on the first user message.
    """
    prompt = f"""Generate a short, concise title (3 to 8 words) for a chat conversation that begins with the following message.
Do not include quotation marks or markdown in the title.
Make it suitable for a sidebar.

User Message:
{query}

Title:"""
    try:
        response = client.models.generate_content(
            model=GENERATION_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.3,
            )
        )
        title = response.text.strip().replace('"', '').replace('`', '')
        if not title:
            return query[:50]
        return title
    except Exception:
        # Fallback to the first 50 chars of the query
        return query[:50]
