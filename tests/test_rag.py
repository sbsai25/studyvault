import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from backend.routers.study_tools import CONTEXT_SEPARATOR, _document_context
from backend.services.rag import (
    AIServiceError,
    add_chunks_to_vector_store,
    delete_document_chunks_from_vector_store,
    generate_flashcards,
    search_chunks,
)


def _gemini_returns(payload):
    text = payload if isinstance(payload, str) else json.dumps(payload)
    return patch(
        "backend.services.rag.client.models.generate_content",
        return_value=SimpleNamespace(text=text),
    )


def test_generate_flashcards_accepts_object_wrapping_a_list():
    item = {"question": "Q", "answer": "A"}
    with _gemini_returns({"flashcards": [item, item]}):
        cards = generate_flashcards("context")
    assert cards == [item, item]


def test_generate_flashcards_drops_malformed_items():
    payload = [
        {"question": "What is DNA?", "answer": "Genetic material."},
        {"question": "Missing answer"},
        {"question": "  ", "answer": "blank question"},
        "not an object",
    ]
    with _gemini_returns(payload):
        cards = generate_flashcards("context")
    assert cards == [{"question": "What is DNA?", "answer": "Genetic material."}]


def test_invalid_json_raises_ai_service_error():
    with _gemini_returns("not json at all"):
        with pytest.raises(AIServiceError):
            generate_flashcards("context")


def test_api_failure_raises_ai_service_error():
    with patch(
        "backend.services.rag.client.models.generate_content",
        side_effect=RuntimeError("503 from provider"),
    ):
        with pytest.raises(AIServiceError):
            generate_flashcards("context")


# --- Retrying transient Gemini errors ---------------------------------------

from google.genai import errors as genai_errors

OVERLOADED = genai_errors.ServerError(503, {"error": {"code": 503, "message": "high demand", "status": "UNAVAILABLE"}})
RATE_LIMITED = genai_errors.ClientError(429, {"error": {"code": 429, "message": "slow down", "status": "RESOURCE_EXHAUSTED"}})
BAD_KEY = genai_errors.ClientError(400, {"error": {"code": 400, "message": "API key not valid", "status": "INVALID_ARGUMENT"}})
GOOD_RESPONSE = SimpleNamespace(text=json.dumps([{"question": "Q", "answer": "A"}]))


@patch("backend.services.rag.time.sleep")
def test_transient_errors_are_retried_with_backoff(mock_sleep):
    with patch(
        "backend.services.rag.client.models.generate_content",
        side_effect=[OVERLOADED, RATE_LIMITED, GOOD_RESPONSE],
    ) as mock_gen:
        cards = generate_flashcards("context")

    assert cards == [{"question": "Q", "answer": "A"}]
    assert mock_gen.call_count == 3
    assert [c.args[0] for c in mock_sleep.call_args_list] == [1.0, 2.0]


@patch("backend.services.rag.time.sleep")
def test_gives_up_after_three_attempts(mock_sleep):
    with patch(
        "backend.services.rag.client.models.generate_content",
        side_effect=[OVERLOADED, OVERLOADED, OVERLOADED, GOOD_RESPONSE],
    ) as mock_gen:
        with pytest.raises(AIServiceError):
            generate_flashcards("context")
    assert mock_gen.call_count == 3


@patch("backend.services.rag.time.sleep")
def test_non_transient_errors_are_not_retried(mock_sleep):
    with patch(
        "backend.services.rag.client.models.generate_content",
        side_effect=[BAD_KEY, GOOD_RESPONSE],
    ) as mock_gen:
        with pytest.raises(AIServiceError):
            generate_flashcards("context")
    assert mock_gen.call_count == 1
    mock_sleep.assert_not_called()


# --- Whole-document context -------------------------------------------------

def test_document_context_empty_document():
    assert _document_context([]) == ""


def test_document_context_single_chunk():
    assert _document_context(["only chunk"]) == "only chunk"


def test_document_context_everything_fits():
    texts = ["a" * 10, "b" * 10, "c" * 10]
    assert _document_context(texts, max_chars=100) == CONTEXT_SEPARATOR.join(texts)


def test_document_context_oversized_single_chunk_is_truncated():
    assert _document_context(["x" * 500], max_chars=100) == "x" * 100


def test_document_context_oversized_chunks_fall_back_to_truncated_first():
    texts = ["F" * 500, "M" * 500, "L" * 500]
    assert _document_context(texts, max_chars=100) == "F" * 100


def test_document_context_spreads_across_long_document():
    # 100 chunks of 100 chars; only ~9 fit in 1000 chars
    texts = [f"{i:03d}" + "." * 97 for i in range(100)]
    context = _document_context(texts, max_chars=1000)

    assert len(context) <= 1000
    parts = context.split(CONTEXT_SEPARATOR)
    picked = [int(p[:3]) for p in parts]
    assert picked[0] == 0 and picked[-1] == 99      # first and last always included
    assert picked == sorted(set(picked))            # document order, no duplicates
    assert len(picked) >= 5                         # not just the first few chunks
    assert all(p in texts for p in parts)           # whole chunks, not truncated


# --- Vector search filters (real temp ChromaDB, mocked embeddings) ---------

def test_search_chunks_filters_by_user_and_document():
    # IDs far away from anything the other tests create in the shared temp store
    user_a, user_b = 900001, 900002
    doc_a1, doc_a2, doc_b = 910001, 910002, 910003
    chunks = [
        {"id": "c-a1", "text": "A1 text", "metadata": {"user_id": user_a, "document_id": doc_a1, "chunk_index": 0}},
        {"id": "c-a2", "text": "A2 text", "metadata": {"user_id": user_a, "document_id": doc_a2, "chunk_index": 0}},
        {"id": "c-b", "text": "B text", "metadata": {"user_id": user_b, "document_id": doc_b, "chunk_index": 0}},
    ]
    vector = [0.1] * 3072  # gemini-embedding-2 dimension, same as the other tests
    with patch("backend.services.rag.get_embedding", return_value=vector):
        add_chunks_to_vector_store(chunks)

    try:
        with patch("backend.services.rag.get_query_embedding", return_value=vector):
            all_a = search_chunks("q", user_id=user_a, top_k=10)
            only_a1 = search_chunks("q", user_id=user_a, top_k=10, document_id=doc_a1)
            # A cannot reach B's document even by naming it
            a_into_b = search_chunks("q", user_id=user_a, top_k=10, document_id=doc_b)

        assert {c["id"] for c in all_a} == {"c-a1", "c-a2"}
        assert [c["id"] for c in only_a1] == ["c-a1"]
        assert only_a1[0]["metadata"]["document_id"] == doc_a1
        assert a_into_b == []
    finally:
        for doc_id in (doc_a1, doc_a2, doc_b):
            delete_document_chunks_from_vector_store(doc_id)
