import json
import logging
import os
import re
import time
from typing import List

import chromadb
from dotenv import load_dotenv
from google import genai
from google.genai import errors as genai_errors
from google.genai import types

load_dotenv()

logger = logging.getLogger(__name__)

GENERATION_MODEL = "gemini-3.6-flash"
EMBEDDING_MODEL = "gemini-embedding-2"

# Initialize Gemini
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# Initialize ChromaDB
CHROMA_PATH = os.getenv("CHROMA_PATH") or os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    ".chroma"
)

chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)

collection = chroma_client.get_or_create_collection(
    name="studyvault_chunks"
)


class AIServiceError(Exception):
    """Raised when a Gemini call fails or returns unusable output.

    The message is for server logs only; the API returns a generic 502.
    """


GEMINI_ATTEMPTS = 3
GEMINI_RETRY_BASE_SECONDS = 1.0  # waits 1s, then 2s


def _is_transient(error: Exception) -> bool:
    """Overloaded (5xx) or rate-limited (429) responses are worth retrying."""
    return isinstance(error, genai_errors.ServerError) or (
        isinstance(error, genai_errors.APIError) and error.code == 429
    )


def _call_gemini(fn, **kwargs):
    """Calls a Gemini SDK method, retrying transient errors with backoff."""
    for attempt in range(1, GEMINI_ATTEMPTS + 1):
        try:
            return fn(**kwargs)
        except Exception as e:
            if attempt == GEMINI_ATTEMPTS or not _is_transient(e):
                raise
            delay = GEMINI_RETRY_BASE_SECONDS * 2 ** (attempt - 1)
            logger.warning("Gemini call failed (%s), retrying in %.0fs (attempt %d/%d)",
                           getattr(e, "code", type(e).__name__), delay, attempt, GEMINI_ATTEMPTS)
            time.sleep(delay)


def get_embedding(text: str) -> List[float]:
    """Generate an embedding for the given text using Gemini."""
    try:
        result = _call_gemini(
            client.models.embed_content,
            model=EMBEDDING_MODEL,
            contents=text,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT"
            ),
        )
        return result.embeddings[0].values
    except Exception as e:
        raise AIServiceError(f"Embedding request failed: {e}") from e


def add_chunks_to_vector_store(chunks: List[dict]):
    """
    Adds chunks to ChromaDB.

    Expected chunk format:
    {
        "id": "chunk_id",
        "text": "content",
        "metadata": {
            "user_id": 1,
            "document_id": 1,
            "chunk_index": 0
        }
    }
    """

    if not chunks:
        return

    ids = []
    documents = []
    embeddings = []
    metadatas = []

    for c in chunks:
        ids.append(str(c["id"]))
        documents.append(c["text"])
        embeddings.append(get_embedding(c["text"]))
        metadatas.append(c["metadata"])

    collection.add(
        ids=ids,
        documents=documents,
        embeddings=embeddings,
        metadatas=metadatas
    )


def delete_document_chunks_from_vector_store(document_id: int):
    """
    Deletes all chunks associated with a document ID from ChromaDB.
    """
    collection.delete(where={"document_id": document_id})

def get_query_embedding(query: str) -> List[float]:
    """Generate an embedding for a search query using Gemini."""
    try:
        result = _call_gemini(
            client.models.embed_content,
            model=EMBEDDING_MODEL,
            contents=query,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY"
            ),
        )
        return result.embeddings[0].values
    except Exception as e:
        raise AIServiceError(f"Query embedding failed: {e}") from e


def search_chunks(
    query: str,
    user_id: int,
    top_k: int = 4,
    document_id: int | None = None,
) -> List[dict]:
    """
    Searches for the most relevant chunks for a query,
    scoped to the user and optionally to one of their documents.
    """

    query_embedding = get_query_embedding(query)

    # Metadata is stored as ints (see documents.py), so filter with ints
    if document_id is None:
        where = {"user_id": user_id}
    else:
        where = {"$and": [{"user_id": user_id}, {"document_id": document_id}]}

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        where=where
    )

    chunks = []

    if results["documents"] and results["documents"][0]:
        for idx in range(len(results["documents"][0])):
            chunks.append({
                "id": results["ids"][0][idx],
                "text": results["documents"][0][idx],
                "metadata": results["metadatas"][0][idx]
            })

    return chunks


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


def generate_quiz(context: str, count: int = 5) -> List[dict]:
    """Returns [{question, options, correct_answer, explanation}].

    Items are dropped unless they have a question, at least two distinct
    options, and a correct_answer that matches one of the options.
    """
    prompt = f"""You are a helpful AI study assistant.
Create a {count}-question multiple choice quiz based on the following text.
Return ONLY a JSON array of objects. Each object should have:
- 'question'
- 'options' (array of 4 strings)
- 'correct_answer' (the exact string of the correct option)
- 'explanation' (one or two sentences explaining why the answer is correct)

Text:
{context}
"""
    questions = []
    for item in _generate_json(prompt):
        if not isinstance(item, dict):
            continue
        question = _clean_str(item.get("question"))
        raw_options = item.get("options")
        if not question or not isinstance(raw_options, list):
            continue
        options = []
        for o in raw_options:
            o = _clean_str(o)
            if o and o not in options:
                options.append(o)
        if len(options) < 2:
            continue
        # Normalise the correct answer to the exact option text
        wanted = _clean_str(item.get("correct_answer")).casefold()
        correct = next((o for o in options if o.casefold() == wanted), None)
        if correct is None:
            continue
        questions.append({
            "question": question,
            "options": options,
            "correct_answer": correct,
            "explanation": _clean_str(item.get("explanation")) or None,
        })
    return questions[:count]


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
