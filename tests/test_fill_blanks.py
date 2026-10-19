import json
from types import SimpleNamespace

import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import get_db
from backend.models.user import User
from backend.models.document import Document
from backend.models.chunk import Chunk
from backend.models.fill_blank import FillBlankSet, FillBlankQuestion, FillBlankAttempt
from backend.routers.fill_blanks import normalize_answer
from backend.services.rag import generate_fill_blanks
from backend.deps import get_current_user

client = TestClient(app)

MOCK_ITEMS = [
    {"sentence": "The ____ is the powerhouse of the cell.", "answer": "mitochondria",
     "accepted_answers": ["mitochondrion"], "hint": "An organelle"},
    {"sentence": "Plants make glucose through ____.", "answer": "photosynthesis",
     "accepted_answers": [], "hint": None},
    {"sentence": "A ____ is a member-owned business.", "answer": "co-op",
     "accepted_answers": ["cooperative"], "hint": None},
]


def setup_test_users_and_docs():
    db = next(get_db())
    db.expire_on_commit = False

    users = []
    for email in ("test_a_blanks@example.com", "test_b_blanks@example.com"):
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(email=email, password_hash="hash")
            db.add(user)
            db.commit()
        users.append(user)
    user_a, user_b = users

    doc_a = db.query(Document).filter(
        Document.user_id == user_a.id, Document.filename == "biology-notes.txt"
    ).first()
    if not doc_a:
        doc_a = Document(user_id=user_a.id, filename="biology-notes.txt", file_type="txt", upload_path="unused")
        db.add(doc_a)
        db.commit()
        db.add(Chunk(document_id=doc_a.id, user_id=user_a.id, content="Mitochondria make ATP.", chunk_index=0))
        db.commit()

    return user_a, user_b, doc_a


def as_user_a():
    app.dependency_overrides[get_current_user] = lambda: setup_test_users_and_docs()[0]
    return client


def as_user_b():
    app.dependency_overrides[get_current_user] = lambda: setup_test_users_and_docs()[1]
    return client


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def create_set():
    _, _, doc_a = setup_test_users_and_docs()
    with patch("backend.routers.study_tools.generate_fill_blanks", return_value=MOCK_ITEMS) as mock_gen:
        res = as_user_a().post("/tools/fill-blanks", json={"document_id": doc_a.id})
    assert res.status_code == 200, res.text
    return res.json(), mock_gen


def question_ids(set_id):
    return [q["id"] for q in as_user_a().get(f"/fill-blanks/{set_id}").json()["questions"]]


# --- Answer normalisation ---------------------------------------------------

@pytest.mark.parametrize("submitted, expected, equal", [
    ("Mitochondria", "mitochondria", True),             # case
    ("  the   mitochondria ", "The mitochondria", True), # whitespace
    ("photosynthesis.", "photosynthesis", True),          # trailing punctuation
    ("“co-op”", "co-op", True),                           # curly quotes at the edges
    ("co-op", "coop", False),                             # inner punctuation kept
    ("3.5", "35", False),
    ("C++", "C", False),                                  # symbols at the ends kept
    ("C#.", "C#", True),
    ("-5", "5", False),
    ("(ATP)", "ATP", True),
    ("mitochondria", "mitochondrion", False),
])
def test_normalize_answer(submitted, expected, equal):
    assert (normalize_answer(submitted) == normalize_answer(expected)) is equal


# --- Generation -------------------------------------------------------------

def test_generate_fill_blanks_validates_items():
    payload = [
        {"sentence": "DNA is stored in the _______.", "answer": "nucleus",
         "accepted_answers": ["Nucleus", "cell nucleus", 5], "hint": "Control centre"},
        {"sentence": "No blank here.", "answer": "x"},
        {"sentence": "Two ____ blanks ____.", "answer": "x"},
        {"sentence": "Missing ____ answer.", "answer": "  "},
    ]
    with patch(
        "backend.services.rag.client.models.generate_content",
        return_value=SimpleNamespace(text=json.dumps(payload)),
    ):
        items = generate_fill_blanks("context", count=10)

    assert items == [{
        "sentence": "DNA is stored in the ____.",  # blank normalised
        "answer": "nucleus",
        "accepted_answers": ["cell nucleus"],      # duplicate of answer and non-strings dropped
        "hint": "Control centre",
    }]


def test_create_fill_blanks_persists_set():
    data, mock_gen = create_set()
    assert data["number_of_questions"] == 3
    assert data["title"] == "Biology Notes Fill-in-the-Blanks"
    assert mock_gen.call_args.kwargs["count"] == 10  # default

    db = next(get_db())
    stored = (
        db.query(FillBlankQuestion)
        .filter(FillBlankQuestion.fill_blank_set_id == data["fill_blank_set_id"])
        .order_by(FillBlankQuestion.id)
        .all()
    )
    assert [q.answer for q in stored] == ["mitochondria", "photosynthesis", "co-op"]
    assert stored[0].accepted_answers == ["mitochondrion"]


def test_create_fill_blanks_no_valid_items_saves_nothing():
    user_a, _, doc_a = setup_test_users_and_docs()
    db = next(get_db())
    before = db.query(FillBlankSet).filter(FillBlankSet.user_id == user_a.id).count()

    with patch("backend.routers.study_tools.generate_fill_blanks", return_value=[]):
        res = as_user_a().post("/tools/fill-blanks", json={"document_id": doc_a.id})

    assert res.status_code == 502
    db = next(get_db())
    assert db.query(FillBlankSet).filter(FillBlankSet.user_id == user_a.id).count() == before


def test_create_fill_blanks_document_not_owned():
    _, _, doc_a = setup_test_users_and_docs()
    with patch("backend.routers.study_tools.generate_fill_blanks", return_value=MOCK_ITEMS):
        res = as_user_b().post("/tools/fill-blanks", json={"document_id": doc_a.id})
    assert res.status_code == 404


# --- Retrieval and submission -----------------------------------------------

def test_get_set_hides_answers():
    data, _ = create_set()
    res = as_user_a().get(f"/fill-blanks/{data['fill_blank_set_id']}")
    assert res.status_code == 200
    for q in res.json()["questions"]:
        assert set(q) == {"id", "sentence", "hint"}
    assert "mitochondrion" not in res.text


def test_submit_grades_with_normalisation_and_accepted_answers():
    data, _ = create_set()
    set_id = data["fill_blank_set_id"]
    ids = question_ids(set_id)

    res = as_user_a().post(f"/fill-blanks/{set_id}/submit", json={"answers": [
        {"question_id": ids[0], "answer": " Mitochondrion. "},  # accepted alternative
        {"question_id": ids[1], "answer": "respiration"},       # wrong
        {"question_id": ids[2], "answer": "coop"},              # inner punctuation matters
    ]})

    assert res.status_code == 200
    body = res.json()
    assert (body["score"], body["total"], body["percentage"]) == (1, 3, 33.3)
    results = {r["question_id"]: r for r in body["results"]}
    assert results[ids[0]]["is_correct"] is True
    assert results[ids[1]]["correct_answer"] == "photosynthesis"
    assert results[ids[2]]["is_correct"] is False
    assert results[ids[2]]["accepted_answers"] == ["cooperative"]


def test_submit_unanswered_and_blank_answers_count_as_wrong():
    data, _ = create_set()
    set_id = data["fill_blank_set_id"]
    ids = question_ids(set_id)

    res = as_user_a().post(f"/fill-blanks/{set_id}/submit", json={"answers": [
        {"question_id": ids[0], "answer": "   "},
    ]})
    body = res.json()
    assert (body["score"], body["total"]) == (0, 3)
    results = {r["question_id"]: r for r in body["results"]}
    assert results[ids[1]]["submitted_answer"] is None


def test_submit_rejects_duplicate_and_foreign_question_ids():
    first, _ = create_set()
    second, _ = create_set()
    ids = question_ids(first["fill_blank_set_id"])
    other = question_ids(second["fill_blank_set_id"])[0]

    dup = as_user_a().post(f"/fill-blanks/{first['fill_blank_set_id']}/submit", json={"answers": [
        {"question_id": ids[0], "answer": "a"}, {"question_id": ids[0], "answer": "b"},
    ]})
    foreign = as_user_a().post(f"/fill-blanks/{first['fill_blank_set_id']}/submit", json={"answers": [
        {"question_id": other, "answer": "mitochondria"},
    ]})
    assert dup.status_code == 422
    assert foreign.status_code == 422


def test_attempts_are_listed_and_reviewable():
    data, _ = create_set()
    set_id = data["fill_blank_set_id"]
    ids = question_ids(set_id)

    as_user_a().post(f"/fill-blanks/{set_id}/submit", json={"answers": []})
    as_user_a().post(f"/fill-blanks/{set_id}/submit", json={"answers": [
        {"question_id": i, "answer": a} for i, a in zip(ids, ["mitochondria", "Photosynthesis", "cooperative"])
    ]})

    attempts = as_user_a().get(f"/fill-blanks/{set_id}/attempts").json()
    assert [a["score"] for a in attempts] == [3, 0]  # newest first

    detail = as_user_a().get(f"/fill-blanks/attempts/{attempts[0]['attempt_id']}").json()
    assert all(r["is_correct"] for r in detail["results"])

    summary = {s["id"]: s for s in as_user_a().get("/fill-blanks").json()}[set_id]
    assert (summary["attempt_count"], summary["best_score"], summary["best_percentage"]) == (2, 3, 100.0)


# --- Ownership and deletion -------------------------------------------------

def test_other_user_cannot_access_set_or_attempts():
    data, _ = create_set()
    set_id = data["fill_blank_set_id"]
    attempt_id = as_user_a().post(f"/fill-blanks/{set_id}/submit", json={"answers": []}).json()["attempt_id"]

    assert set_id not in {s["id"] for s in as_user_b().get("/fill-blanks").json()}
    assert as_user_b().get(f"/fill-blanks/{set_id}").status_code == 404
    assert as_user_b().post(f"/fill-blanks/{set_id}/submit", json={"answers": []}).status_code == 404
    assert as_user_b().get(f"/fill-blanks/{set_id}/attempts").status_code == 404
    assert as_user_b().get(f"/fill-blanks/attempts/{attempt_id}").status_code == 404
    assert as_user_b().delete(f"/fill-blanks/{set_id}").status_code == 404
    assert as_user_a().get(f"/fill-blanks/{set_id}").status_code == 200


def test_delete_set_cascades():
    data, _ = create_set()
    set_id = data["fill_blank_set_id"]
    attempt_id = as_user_a().post(f"/fill-blanks/{set_id}/submit", json={"answers": []}).json()["attempt_id"]

    assert as_user_a().delete(f"/fill-blanks/{set_id}").status_code == 200

    db = next(get_db())
    assert db.query(FillBlankSet).filter(FillBlankSet.id == set_id).first() is None
    assert db.query(FillBlankQuestion).filter(FillBlankQuestion.fill_blank_set_id == set_id).count() == 0
    assert db.query(FillBlankAttempt).filter(FillBlankAttempt.id == attempt_id).first() is None
