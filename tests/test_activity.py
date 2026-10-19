import uuid
from datetime import date, datetime, timedelta

import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import get_db
from backend.deps import get_current_user
from backend.models.activity import Activity
from backend.models.chunk import Chunk
from backend.models.document import Document
from backend.models.user import User
from backend.routers.activity import compute_streaks
from backend.services.rag import AIServiceError

client = TestClient(app)

MOCK_CARDS = [
    {"question": "Q1", "answer": "A1"},
    {"question": "Q2", "answer": "A2"},
]
MOCK_QUIZ = [
    {"question": "2 + 2?", "options": ["3", "4"], "correct_answer": "4", "explanation": None},
    {"question": "3 + 3?", "options": ["6", "7"], "correct_answer": "6", "explanation": None},
]


@pytest.fixture
def user():
    """A brand-new user per test, so counts start from zero."""
    db = next(get_db())
    db.expire_on_commit = False
    u = User(email=f"activity_{uuid.uuid4().hex[:10]}@example.com", password_hash="hash")
    db.add(u)
    db.commit()
    app.dependency_overrides[get_current_user] = lambda: u
    yield u
    app.dependency_overrides.clear()


def make_document(user, filename="notes.txt"):
    db = next(get_db())
    db.expire_on_commit = False
    doc = Document(user_id=user.id, filename=filename, file_type="txt", upload_path="unused")
    db.add(doc)
    db.commit()
    db.add(Chunk(document_id=doc.id, user_id=user.id, content="Some content.", chunk_index=0))
    db.commit()
    return doc


def activities(user):
    db = next(get_db())
    return (
        db.query(Activity)
        .filter(Activity.user_id == user.id)
        .order_by(Activity.id)
        .all()
    )


def add_activity(user, when, activity_type="chat_message"):
    db = next(get_db())
    db.add(Activity(user_id=user.id, activity_type=activity_type, created_at=when))
    db.commit()


# --- Streak calculation -----------------------------------------------------

TODAY = date(2026, 10, 20)


def days_ago(*offsets):
    return {TODAY - timedelta(days=o) for o in offsets}


@pytest.mark.parametrize("active, expected", [
    (set(), (0, 0)),
    (days_ago(0), (1, 1)),
    (days_ago(0, 1, 2), (3, 3)),
    (days_ago(1, 2), (2, 2)),             # nothing yet today: streak still holds
    (days_ago(2, 3), (0, 2)),             # missed yesterday: current resets
    (days_ago(0, 5, 6, 7, 8), (1, 4)),    # longest is an older run
])
def test_compute_streaks(active, expected):
    assert compute_streaks(active, TODAY) == expected


# --- Activity is logged with the action ------------------------------------

@patch("backend.services.rag.get_embedding", return_value=[0.1] * 3072)
def test_upload_logs_activity(_embed, user):
    res = client.post("/documents/upload", files={"file": ("bio.txt", b"Cells are small.", "text/plain")})
    assert res.status_code == 200

    [event] = activities(user)
    assert event.activity_type == "document_uploaded"
    assert event.related_entity_id == res.json()["document_id"]
    assert event.metadata_data == {"filename": "bio.txt", "chunks": 1}


@patch("backend.services.rag.get_embedding", side_effect=AIServiceError("down"))
def test_failed_upload_logs_nothing(_embed, user):
    res = client.post("/documents/upload", files={"file": ("bio.txt", b"Cells are small.", "text/plain")})
    assert res.status_code == 502
    assert activities(user) == []


def test_study_actions_log_activity(user):
    doc = make_document(user)

    with patch("backend.routers.study_tools.generate_flashcards", return_value=MOCK_CARDS):
        set_id = client.post("/tools/flashcards", json={"document_id": doc.id}).json()["flashcard_set_id"]
    card_id = client.get(f"/flashcards/{set_id}").json()["cards"][0]["id"]
    client.post(f"/flashcards/{card_id}/review", json={"difficulty": "good"})

    with patch("backend.routers.study_tools.generate_quiz", return_value=MOCK_QUIZ):
        quiz_id = client.post("/tools/quiz", json={"document_id": doc.id}).json()["quiz_id"]
    q_ids = [q["id"] for q in client.get(f"/quizzes/{quiz_id}").json()["questions"]]
    attempt = client.post(f"/quizzes/{quiz_id}/submit", json={"answers": [
        {"question_id": q_ids[0], "selected_answer": "4"},
    ]}).json()

    events = activities(user)
    assert [e.activity_type for e in events] == [
        "flashcards_generated", "flashcard_reviewed", "quiz_generated", "quiz_submitted",
    ]
    assert events[0].metadata_data == {"document_id": doc.id, "number_of_cards": 2}
    assert events[1].related_entity_id == card_id
    assert events[1].metadata_data["rating"] == "good"
    assert events[3].related_entity_id == quiz_id
    assert events[3].metadata_data == {
        "attempt_id": attempt["attempt_id"], "score": 1, "total": 2, "percentage": 50.0,
    }


def test_rejected_actions_log_nothing(user):
    doc = make_document(user)
    with patch("backend.routers.study_tools.generate_quiz", return_value=MOCK_QUIZ):
        quiz_id = client.post("/tools/quiz", json={"document_id": doc.id}).json()["quiz_id"]
    q_id = client.get(f"/quizzes/{quiz_id}").json()["questions"][0]["id"]
    before = len(activities(user))

    # Duplicate answers -> 422; AI failure while generating flashcards -> 502
    client.post(f"/quizzes/{quiz_id}/submit", json={"answers": [
        {"question_id": q_id, "selected_answer": "4"}, {"question_id": q_id, "selected_answer": "3"},
    ]})
    with patch("backend.routers.study_tools.generate_flashcards", side_effect=AIServiceError("down")):
        client.post("/tools/flashcards", json={"document_id": doc.id})

    assert len(activities(user)) == before


@patch("backend.routers.chat.generate_conversation_title", return_value="Title")
@patch("backend.routers.chat.generate_answer", return_value="Answer")
@patch("backend.routers.chat.search_chunks", return_value=[])
def test_chat_logs_activity(_search, _answer, _title, user):
    conv_id = client.post("/chat/", json={"query": "Hi"}).json()["conversation_id"]
    [event] = activities(user)
    assert event.activity_type == "chat_message"
    assert event.related_entity_id == conv_id


# --- /activity --------------------------------------------------------------

def test_activity_feed_is_paginated_and_scoped(user):
    now = datetime.utcnow()
    for minutes in (3, 2, 1):
        add_activity(user, now - timedelta(minutes=minutes))

    page1 = client.get("/activity?limit=2").json()
    page2 = client.get("/activity?limit=2&offset=2").json()
    assert len(page1) == 2 and len(page2) == 1
    assert page1[0]["created_at"] > page1[1]["created_at"] > page2[0]["created_at"]  # newest first

    other = User(email=f"activity_other_{uuid.uuid4().hex[:8]}@example.com", password_hash="hash")
    db = next(get_db())
    db.expire_on_commit = False
    db.add(other)
    db.commit()
    app.dependency_overrides[get_current_user] = lambda: other
    assert client.get("/activity").json() == []


def test_activity_limit_is_bounded(user):
    assert client.get("/activity?limit=0").status_code == 422
    assert client.get("/activity?limit=101").status_code == 422


# --- /stats -----------------------------------------------------------------

def test_stats_for_new_user_are_zero(user):
    stats = client.get("/stats").json()
    assert stats["documents"] == 0
    assert stats["flashcards"] == 0
    assert stats["cards_due_now"] == 0
    assert stats["average_quiz_percentage"] is None
    assert stats["current_streak_days"] == 0
    assert len(stats["daily_activity"]) == 14
    assert all(d["count"] == 0 for d in stats["daily_activity"])


def test_stats_counts_and_averages(user):
    doc = make_document(user)
    with patch("backend.routers.study_tools.generate_flashcards", return_value=MOCK_CARDS):
        set_id = client.post("/tools/flashcards", json={"document_id": doc.id}).json()["flashcard_set_id"]
    card_id = client.get(f"/flashcards/{set_id}").json()["cards"][0]["id"]
    client.post(f"/flashcards/{card_id}/review", json={"difficulty": "again"})  # due in 10 min

    with patch("backend.routers.study_tools.generate_quiz", return_value=MOCK_QUIZ):
        quiz_id = client.post("/tools/quiz", json={"document_id": doc.id}).json()["quiz_id"]
    q_ids = [q["id"] for q in client.get(f"/quizzes/{quiz_id}").json()["questions"]]
    client.post(f"/quizzes/{quiz_id}/submit", json={"answers": [
        {"question_id": q_ids[0], "selected_answer": "4"}, {"question_id": q_ids[1], "selected_answer": "6"},
    ]})  # 100%
    client.post(f"/quizzes/{quiz_id}/submit", json={"answers": []})  # 0%

    stats = client.get("/stats").json()
    assert stats["documents"] == 1
    assert stats["flashcard_sets"] == 1
    assert stats["flashcards"] == 2
    assert stats["flashcards_never_reviewed"] == 1
    assert stats["cards_due_now"] == 0  # the reviewed card is due in 10 minutes
    assert stats["reviews_last_7_days"] == 1
    assert stats["quizzes"] == 1
    assert stats["quiz_attempts"] == 2
    assert stats["average_quiz_percentage"] == 50.0
    # flashcards_generated, flashcard_reviewed, quiz_generated, 2 x quiz_submitted
    assert stats["daily_activity"][-1] == {"date": datetime.utcnow().date().isoformat(), "count": 5}
    assert stats["current_streak_days"] == 1


def test_stats_streaks_and_daily_window(user):
    now = datetime.utcnow()
    for days in (1, 2, 3, 20, 21):  # yesterday back 3 days, plus an older 2-day run
        add_activity(user, now - timedelta(days=days))

    stats = client.get("/stats").json()
    assert stats["current_streak_days"] == 3   # holds through today until midnight UTC
    assert stats["longest_streak_days"] == 3
    counts = [d["count"] for d in stats["daily_activity"]]
    assert counts[-4:] == [1, 1, 1, 0]          # 3 days ago .. today
    assert sum(counts) == 3                     # the 20-day-old events are outside the window
