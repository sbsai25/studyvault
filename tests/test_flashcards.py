import pytest
from datetime import datetime, timedelta
from unittest.mock import patch
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import get_db
from backend.models.user import User
from backend.models.document import Document
from backend.models.chunk import Chunk
from backend.models.flashcard import FlashcardSet, Flashcard, FlashcardProgress
from backend.deps import get_current_user

client = TestClient(app)

MOCK_CARDS = [
    {"question": "What is StudyVault?", "answer": "An AI study assistant."},
    {"question": "What database does it use?", "answer": "PostgreSQL."},
    {"question": "What vector store does it use?", "answer": "ChromaDB."},
]


def setup_test_users_and_docs():
    db = next(get_db())
    # The returned objects outlive this session, so keep their loaded
    # attributes instead of expiring them on each commit.
    db.expire_on_commit = False

    user_a = db.query(User).filter(User.email == "test_a_flashcards@example.com").first()
    if not user_a:
        user_a = User(email="test_a_flashcards@example.com", password_hash="hash")
        db.add(user_a)
        db.commit()
        db.refresh(user_a)

    user_b = db.query(User).filter(User.email == "test_b_flashcards@example.com").first()
    if not user_b:
        user_b = User(email="test_b_flashcards@example.com", password_hash="hash")
        db.add(user_b)
        db.commit()
        db.refresh(user_b)

    doc_a = db.query(Document).filter(
        Document.user_id == user_a.id, Document.filename == "flashcards_test.txt"
    ).first()
    if not doc_a:
        doc_a = Document(
            user_id=user_a.id,
            filename="flashcards_test.txt",
            file_type="txt",
            upload_path="unused",
        )
        db.add(doc_a)
        db.commit()
        db.refresh(doc_a)

        chunk = db.query(Chunk).filter(Chunk.document_id == doc_a.id).first()
        if not chunk:
            db.add(Chunk(
                document_id=doc_a.id,
                user_id=user_a.id,
                content="StudyVault is an AI study assistant built with FastAPI and PostgreSQL.",
                chunk_index=0,
            ))
            db.commit()

    return user_a, user_b, doc_a


def override_get_current_user_a():
    user_a, _, _ = setup_test_users_and_docs()
    return user_a


def override_get_current_user_b():
    _, user_b, _ = setup_test_users_and_docs()
    return user_b


def as_user_a():
    """Returns the shared TestClient with the dependency override set to user A.

    `app.dependency_overrides` is a single global dict on the shared `app`
    instance, so it must be (re)set immediately before each request rather
    than left active for the duration of a test -- otherwise a test using
    both "user A" and "user B" helpers would have the later override silently
    clobber the earlier one for every request in the test.
    """
    app.dependency_overrides[get_current_user] = override_get_current_user_a
    return client


def as_user_b():
    app.dependency_overrides[get_current_user] = override_get_current_user_b
    return client


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def create_flashcard_set():
    """Helper: mocks Gemini and generates a fresh flashcard set owned by user A."""
    _, _, doc_a = setup_test_users_and_docs()
    with patch("backend.routers.study_tools.generate_flashcards", return_value=MOCK_CARDS):
        res = as_user_a().post("/tools/flashcards", json={"document_id": doc_a.id})
    assert res.status_code == 200
    return res.json()


def test_generate_flashcards_creates_set_and_cards():
    data = create_flashcard_set()

    assert "flashcard_set_id" in data
    assert data["number_of_cards"] == len(MOCK_CARDS)
    assert data["title"]

    db = next(get_db())
    flashcard_set = db.query(FlashcardSet).filter(FlashcardSet.id == data["flashcard_set_id"]).first()
    assert flashcard_set is not None

    cards = db.query(Flashcard).filter(Flashcard.flashcard_set_id == flashcard_set.id).all()
    assert len(cards) == len(MOCK_CARDS)
    assert {c.question for c in cards} == {c["question"] for c in MOCK_CARDS}


def test_generate_flashcards_document_not_owned():
    _, _, doc_a = setup_test_users_and_docs()
    with patch("backend.routers.study_tools.generate_flashcards", return_value=MOCK_CARDS):
        res = as_user_b().post("/tools/flashcards", json={"document_id": doc_a.id})
    assert res.status_code == 404


def test_list_flashcard_sets_scoped_to_user():
    create_flashcard_set()

    res_a = as_user_a().get("/flashcards")
    assert res_a.status_code == 200
    assert len(res_a.json()) >= 1
    assert all("number_of_cards" in s for s in res_a.json())
    a_ids = {s["id"] for s in res_a.json()}

    res_b = as_user_b().get("/flashcards")
    assert res_b.status_code == 200
    b_ids = {s["id"] for s in res_b.json()}
    assert b_ids.isdisjoint(a_ids)


def test_get_flashcard_set_detail():
    data = create_flashcard_set()
    set_id = data["flashcard_set_id"]

    res = as_user_a().get(f"/flashcards/{set_id}")
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == set_id
    assert len(body["cards"]) == len(MOCK_CARDS)
    for card in body["cards"]:
        assert "question" in card and "answer" in card
        assert card["progress"] is None


def test_get_flashcard_set_not_owned():
    data = create_flashcard_set()
    res = as_user_b().get(f"/flashcards/{data['flashcard_set_id']}")
    assert res.status_code == 404


def test_review_creates_progress():
    data = create_flashcard_set()
    set_detail = as_user_a().get(f"/flashcards/{data['flashcard_set_id']}").json()
    card_id = set_detail["cards"][0]["id"]

    res = as_user_a().post(f"/flashcards/{card_id}/review", json={"difficulty": "good"})
    assert res.status_code == 200
    body = res.json()
    assert body["review_count"] == 1
    assert body["difficulty"] == "good"

    db = next(get_db())
    progress = db.query(FlashcardProgress).filter(FlashcardProgress.flashcard_id == card_id).first()
    assert progress is not None
    expected = datetime.utcnow() + timedelta(days=3)
    assert abs((progress.next_review_at - expected).total_seconds()) < 30


def test_review_updates_existing_progress():
    data = create_flashcard_set()
    set_detail = as_user_a().get(f"/flashcards/{data['flashcard_set_id']}").json()
    card_id = set_detail["cards"][1]["id"]

    as_user_a().post(f"/flashcards/{card_id}/review", json={"difficulty": "again"})
    res = as_user_a().post(f"/flashcards/{card_id}/review", json={"difficulty": "easy"})
    assert res.status_code == 200
    body = res.json()
    assert body["review_count"] == 2
    assert body["difficulty"] == "easy"

    db = next(get_db())
    progress = db.query(FlashcardProgress).filter(FlashcardProgress.flashcard_id == card_id).first()
    expected = datetime.utcnow() + timedelta(days=7)
    assert abs((progress.next_review_at - expected).total_seconds()) < 30


def test_review_invalid_difficulty():
    data = create_flashcard_set()
    set_detail = as_user_a().get(f"/flashcards/{data['flashcard_set_id']}").json()
    card_id = set_detail["cards"][0]["id"]

    res = as_user_a().post(f"/flashcards/{card_id}/review", json={"difficulty": "banana"})
    assert res.status_code == 422


def test_review_not_owned_card():
    data = create_flashcard_set()
    set_detail = as_user_a().get(f"/flashcards/{data['flashcard_set_id']}").json()
    card_id = set_detail["cards"][0]["id"]

    res = as_user_b().post(f"/flashcards/{card_id}/review", json={"difficulty": "good"})
    assert res.status_code == 404


def test_get_due_flashcards_scoped_to_user():
    data = create_flashcard_set()
    set_detail = as_user_a().get(f"/flashcards/{data['flashcard_set_id']}").json()
    card_id = set_detail["cards"][0]["id"]

    # "again" -> due in 10 minutes, not due yet; force it into the past directly.
    as_user_a().post(f"/flashcards/{card_id}/review", json={"difficulty": "again"})

    db = next(get_db())
    progress = db.query(FlashcardProgress).filter(FlashcardProgress.flashcard_id == card_id).first()
    progress.next_review_at = datetime.utcnow() - timedelta(minutes=1)
    db.commit()

    res_a = as_user_a().get("/flashcards/due")
    assert res_a.status_code == 200
    due_ids = {c["id"] for c in res_a.json()}
    assert card_id in due_ids

    res_b = as_user_b().get("/flashcards/due")
    assert res_b.status_code == 200
    assert card_id not in {c["id"] for c in res_b.json()}


def test_delete_flashcard_set_not_owned():
    data = create_flashcard_set()
    res = as_user_b().delete(f"/flashcards/{data['flashcard_set_id']}")
    assert res.status_code == 404


def test_delete_flashcard_set_cascades():
    data = create_flashcard_set()
    set_id = data["flashcard_set_id"]
    set_detail = as_user_a().get(f"/flashcards/{set_id}").json()
    card_id = set_detail["cards"][0]["id"]
    as_user_a().post(f"/flashcards/{card_id}/review", json={"difficulty": "good"})

    res = as_user_a().delete(f"/flashcards/{set_id}")
    assert res.status_code == 200

    db = next(get_db())
    assert db.query(FlashcardSet).filter(FlashcardSet.id == set_id).first() is None
    assert db.query(Flashcard).filter(Flashcard.flashcard_set_id == set_id).count() == 0
    assert db.query(FlashcardProgress).filter(FlashcardProgress.flashcard_id == card_id).first() is None
