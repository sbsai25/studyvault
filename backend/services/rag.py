import json
import logging
import os
from typing import List

import chromadb
from dotenv import load_dotenv
from google import genai
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


def get_embedding(text: str) -> List[float]:
    """Generate an embedding for the given text using Gemini."""
    try:
        result = client.models.embed_content(
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

def search_chunks(
    query: str,
    user_id: int,
    top_k: int = 4
) -> List[dict]:
    """
    Searches for the most relevant chunks for a query,
    scoped to the user.
    """

    try:
        result = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=query,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY"
            ),
        )
    except Exception as e:
        raise AIServiceError(f"Query embedding failed: {e}") from e

    query_embedding = result.embeddings[0].values

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=top_k,
        where={"user_id": user_id}
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


def generate_answer(query: str, context_chunks: List[dict]) -> str:
    """
    Generates an answer using Gemini given the retrieved context.
    """

    context_text = "\n\n---\n\n".join(
        [
            f"Source Document ID: "
            f"{c['metadata'].get('document_id', 'Unknown')}\n"
            f"{c['text']}"
            for c in context_chunks
        ]
    )

    prompt = f"""You are a helpful AI study assistant.

Use the following retrieved context from the user's study materials
to answer their question.

If the context doesn't contain the answer, say:
"I couldn't find the answer in your uploaded materials."

Context:
{context_text}

Question:
{query}

Answer:"""

    try:
        response = client.models.generate_content(
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
        response = client.models.generate_content(
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
