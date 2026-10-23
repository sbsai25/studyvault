import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from backend.database import SessionLocal
from backend.models.chunk import EMBEDDING_DIMENSIONS, Chunk
from backend.models.document import Document
from backend.models.user import User
from backend.routers.study_tools import CONTEXT_SEPARATOR, _document_context
from backend.services.rag import (
    AIServiceError,
    embed_chunks,
    generate_flashcards,
    get_embeddings,
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


def _quota_error(quota_id, retry_delay="32s"):
    return genai_errors.ClientError(429, {"error": {
        "code": 429, "message": "quota exceeded", "status": "RESOURCE_EXHAUSTED",
        "details": [
            {"@type": "type.googleapis.com/google.rpc.QuotaFailure",
             "violations": [{"quotaId": quota_id}]},
            {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": retry_delay},
        ],
    }})


@patch("backend.services.rag.time.sleep")
def test_per_minute_quota_waits_as_long_as_the_api_asks(mock_sleep):
    per_minute = _quota_error("EmbedContentRequestsPerMinutePerUserPerProjectPerModel-FreeTier")
    with patch(
        "backend.services.rag.client.models.generate_content",
        side_effect=[per_minute, GOOD_RESPONSE],
    ):
        generate_flashcards("context")
    assert [c.args[0] for c in mock_sleep.call_args_list] == [32.0]


@patch("backend.services.rag.time.sleep")
def test_daily_quota_or_long_waits_are_not_retried(mock_sleep):
    daily = _quota_error("GenerateRequestsPerDayPerProjectPerModel-FreeTier")
    too_long = _quota_error("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", retry_delay="300s")
    for error in (daily, too_long):
        with patch(
            "backend.services.rag.client.models.generate_content",
            side_effect=[error, GOOD_RESPONSE],
        ) as mock_gen:
            with pytest.raises(AIServiceError):
                generate_flashcards("context")
        assert mock_gen.call_count == 1
    mock_sleep.assert_not_called()


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


# --- Vector search (real pgvector in the test database, mocked embeddings) --

def _unit_vector(axis):
    vector = [0.0] * EMBEDDING_DIMENSIONS
    vector[axis] = 1.0
    return vector


@pytest.fixture
def vector_db():
    """Two users with documents and embedded chunks; removed afterwards."""
    db = SessionLocal()
    users = [User(email=f"rag_{name}_{id(db)}@example.com", password_hash="unused") for name in ("a", "b")]
    db.add_all(users)
    db.flush()
    user_a, user_b = users
    docs = {
        name: Document(user_id=owner.id, filename=f"{name}.txt", file_type="txt", upload_path="unused")
        for name, owner in (("a1", user_a), ("a2", user_a), ("b", user_b))
    }
    db.add_all(docs.values())
    db.flush()
    chunks = {
        # a1 points along axis 0 and a2 along axis 1, so a query along axis 0 ranks a1 first
        "a1": Chunk(document_id=docs["a1"].id, user_id=user_a.id, content="A1 text", chunk_index=0,
                    embedding=_unit_vector(0)),
        "a2": Chunk(document_id=docs["a2"].id, user_id=user_a.id, content="A2 text", chunk_index=0,
                    embedding=_unit_vector(1)),
        "b": Chunk(document_id=docs["b"].id, user_id=user_b.id, content="B text", chunk_index=0,
                   embedding=_unit_vector(0)),
        # Stored before vectors moved into Postgres: never returned
        "legacy": Chunk(document_id=docs["a1"].id, user_id=user_a.id, content="Old text", chunk_index=1),
    }
    db.add_all(chunks.values())
    db.commit()
    try:
        yield db, user_a, user_b, docs, chunks
    finally:
        for user in users:
            db.delete(user)  # cascades to documents and chunks
        db.commit()
        db.close()


def test_search_chunks_filters_by_user_and_document(vector_db):
    db, user_a, _, docs, chunks = vector_db

    with patch("backend.services.rag.get_query_embedding", return_value=_unit_vector(0)):
        all_a = search_chunks("q", user_id=user_a.id, db=db, top_k=10)
        only_a1 = search_chunks("q", user_id=user_a.id, db=db, top_k=10, document_id=docs["a1"].id)
        # A cannot reach B's document even by naming it
        a_into_b = search_chunks("q", user_id=user_a.id, db=db, top_k=10, document_id=docs["b"].id)

    assert [c["id"] for c in all_a] == [str(chunks["a1"].id), str(chunks["a2"].id)]  # nearest first
    assert [c["id"] for c in only_a1] == [str(chunks["a1"].id)]
    assert only_a1[0]["text"] == "A1 text"
    assert only_a1[0]["metadata"] == {"user_id": user_a.id, "document_id": docs["a1"].id, "chunk_index": 0}
    assert a_into_b == []


def test_search_chunks_respects_top_k(vector_db):
    db, user_a, _, _, chunks = vector_db

    with patch("backend.services.rag.get_query_embedding", return_value=_unit_vector(1)):
        results = search_chunks("q", user_id=user_a.id, db=db, top_k=1)

    assert [c["id"] for c in results] == [str(chunks["a2"].id)]


def test_embed_chunks_sets_each_embedding():
    chunks = [Chunk(content="first"), Chunk(content="second")]
    with patch("backend.services.rag.get_embeddings", return_value=[[0.1], [0.2]]) as mock_embed:
        embed_chunks(chunks)

    assert [c.embedding for c in chunks] == [[0.1], [0.2]]
    mock_embed.assert_called_once_with(["first", "second"])


def _embed_response(contents, **_):
    # One vector per Content, encoding its text's length so order can be checked
    return SimpleNamespace(embeddings=[SimpleNamespace(values=[float(len(c.parts[0].text))]) for c in contents])


def test_get_embeddings_sends_batches_in_order():
    texts = ["x" * n for n in range(1, 251)]
    with patch("backend.services.rag.client.models.embed_content", side_effect=_embed_response) as mock_embed:
        vectors = get_embeddings(texts)

    assert [len(call.kwargs["contents"]) for call in mock_embed.call_args_list] == [100, 100, 50]
    assert vectors == [[float(n)] for n in range(1, 251)]  # one per text, in order


def test_get_embeddings_rejects_a_short_response():
    short = SimpleNamespace(embeddings=[SimpleNamespace(values=[0.1])])
    with patch("backend.services.rag.client.models.embed_content", return_value=short):
        with pytest.raises(AIServiceError):
            get_embeddings(["first", "second"])
