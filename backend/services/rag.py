import os
from typing import List

import chromadb
from chromadb.config import Settings
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

# Initialize Gemini
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# Initialize ChromaDB
CHROMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    ".chroma"
)

chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)

collection = chroma_client.get_or_create_collection(
    name="studyvault_chunks"
)


def get_embedding(text: str) -> List[float]:
    """Generate an embedding for the given text using Gemini."""

    result = client.models.embed_content(
        model="gemini-embedding-2",
        contents=text,
        config=types.EmbedContentConfig(
            task_type="RETRIEVAL_DOCUMENT"
        ),
    )

    return result.embeddings[0].values


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

    result = client.models.embed_content(
        model="gemini-embedding-2",
        contents=query,
        config=types.EmbedContentConfig(
            task_type="RETRIEVAL_QUERY"
        ),
    )

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

    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=prompt
    )

    return response.text

import json

def generate_flashcards(context: str) -> List[dict]:
    prompt = f"""You are a helpful AI study assistant.
Create between 5 and 15 important Q&A flashcards based on the following text.
Base the number of flashcards on the length and density of the content.
Return ONLY a JSON array of objects with 'question' and 'answer' keys.

Text:
{context}
"""
    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        )
    )
    try:
        return json.loads(response.text)
    except Exception:
        return []

def generate_quiz(context: str) -> list[dict]:
    prompt = f"""You are a helpful AI study assistant.
Create a 3-question multiple choice quiz based on the following text.
Return ONLY a JSON array of objects. Each object should have:
- 'question'
- 'options' (array of 4 strings)
- 'correct_answer' (the exact string of the correct option)

Text:
{context}
"""
    response = client.models.generate_content(
        model="gemini-3.6-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        )
    )
    try:
        import json
        return json.loads(response.text)
    except Exception:
        return []

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
            model="gemini-3.6-flash",
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
