import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import get_db
from backend.models.user import User
from backend.models.document import Document
from backend.models.chunk import Chunk
from backend.models.quiz import Quiz, QuizQuestion, QuizAttempt, QuizAnswer
from backend.deps import get_current_user

client = TestClient(app)

MOCK_QUIZ = [
    {"question": "What is the powerhouse of the cell?",
     "options": ["Nucleus", "Mitochondria", "Ribosome", "Golgi body"],
     "correct_answer": "Mitochondria",
     "explanation": "Mitochondria produce most of the cell's ATP."},
    {"question": "What carries genetic information?",
     "options": ["DNA", "ATP", "Glucose", "Lipids"],
     "correct_answer": "DNA",
     "explanation": "DNA encodes genetic instructions."},
    {"question": "Which organelle makes proteins?",
     "options": ["Ribosome", "Lysosome", "Vacuole", "Cell wall"],
     "correct_answer": "Ribosome",
     "explanation": None},
]


def setup_test_users_and_docs():
    db = next(get_db())
    db.expire_on_commit = False

    users = []
    for email in ("test_a_quiz@example.com", "test_b_quiz@example.com"):
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(email=email, password_hash="hash")
            db.add(user)
            db.commit()
        users.append(user)
    user_a, user_b = users

    doc_a = db.query(Document).filter(
        Document.user_id == user_a.id, Document.filename == "cell_biology.txt"
    ).first()
    if not doc_a:
        doc_a = Document(user_id=user_a.id, filename="cell_biology.txt", file_type="txt", upload_path="unused")
        db.add(doc_a)
        db.commit()
        db.add(Chunk(
            document_id=doc_a.id,
            user_id=user_a.id,
            content="Mitochondria are the powerhouse of the cell. DNA carries genetic information.",
            chunk_index=0,
        ))
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


def create_quiz(num_questions=None):
    _, _, doc_a = setup_test_users_and_docs()
    payload = {"document_id": doc_a.id}
    if num_questions is not None:
        payload["num_questions"] = num_questions
    with patch("backend.routers.study_tools.generate_quiz", return_value=MOCK_QUIZ) as mock_gen:
        res = as_user_a().post("/tools/quiz", json=payload)
    assert res.status_code == 200, res.text
    return res.json(), mock_gen


def question_ids(quiz_id):
    body = as_user_a().get(f"/quizzes/{quiz_id}").json()
    return [q["id"] for q in body["questions"]]


# --- Generation -------------------------------------------------------------

def test_generate_quiz_persists_and_keeps_dashboard_shape():
    data, mock_gen = create_quiz()

    assert data["number_of_questions"] == 3
    assert data["title"] == "Cell Biology Quiz"
    # The Dashboard reads result.quiz with the answers included
    assert data["quiz"][0]["correct_answer"] == "Mitochondria"
    assert mock_gen.call_args.kwargs["count"] == 5  # default

    db = next(get_db())
    quiz = db.query(Quiz).filter(Quiz.id == data["quiz_id"]).first()
    assert quiz is not None
    stored = db.query(QuizQuestion).filter(QuizQuestion.quiz_id == quiz.id).order_by(QuizQuestion.id).all()
    assert [q.question for q in stored] == [q["question"] for q in MOCK_QUIZ]
    assert stored[0].explanation == MOCK_QUIZ[0]["explanation"]


def test_generate_quiz_passes_requested_question_count():
    _, mock_gen = create_quiz(num_questions=10)
    assert mock_gen.call_args.kwargs["count"] == 10


@pytest.mark.parametrize("bad_count", [2, 21])
def test_generate_quiz_rejects_out_of_range_count(bad_count):
    _, _, doc_a = setup_test_users_and_docs()
    res = as_user_a().post("/tools/quiz", json={"document_id": doc_a.id, "num_questions": bad_count})
    assert res.status_code == 422


def test_generate_quiz_with_no_valid_questions_saves_nothing():
    user_a, _, doc_a = setup_test_users_and_docs()
    db = next(get_db())
    before = db.query(Quiz).filter(Quiz.user_id == user_a.id).count()

    with patch("backend.routers.study_tools.generate_quiz", return_value=[]):
        res = as_user_a().post("/tools/quiz", json={"document_id": doc_a.id})

    assert res.status_code == 502
    db = next(get_db())
    assert db.query(Quiz).filter(Quiz.user_id == user_a.id).count() == before


def test_generate_quiz_ai_failure_returns_generic_502():
    user_a, _, doc_a = setup_test_users_and_docs()
    db = next(get_db())
    before = db.query(Quiz).filter(Quiz.user_id == user_a.id).count()

    with patch(
        "backend.services.rag.client.models.generate_content",
        side_effect=RuntimeError("provider exploded with key AIza-secret"),
    ):
        res = as_user_a().post("/tools/quiz", json={"document_id": doc_a.id})

    assert res.status_code == 502
    assert "AIza" not in res.text
    db = next(get_db())
    assert db.query(Quiz).filter(Quiz.user_id == user_a.id).count() == before


def test_generate_quiz_document_not_owned():
    _, _, doc_a = setup_test_users_and_docs()
    with patch("backend.routers.study_tools.generate_quiz", return_value=MOCK_QUIZ):
        res = as_user_b().post("/tools/quiz", json={"document_id": doc_a.id})
    assert res.status_code == 404


# --- Retrieval --------------------------------------------------------------

def test_get_quiz_hides_answers_and_explanations():
    data, _ = create_quiz()
    res = as_user_a().get(f"/quizzes/{data['quiz_id']}")
    assert res.status_code == 200
    body = res.json()
    assert body["number_of_questions"] == 3
    for q in body["questions"]:
        assert set(q) == {"id", "question", "options"}
    assert "Mitochondria produce" not in res.text


def test_list_quizzes_scoped_and_summarised():
    data, _ = create_quiz()
    ids = question_ids(data["quiz_id"])
    as_user_a().post(f"/quizzes/{data['quiz_id']}/submit", json={
        "answers": [{"question_id": ids[0], "selected_answer": "Mitochondria"}],
    })

    quizzes = {q["id"]: q for q in as_user_a().get("/quizzes").json()}
    summary = quizzes[data["quiz_id"]]
    assert summary["number_of_questions"] == 3
    assert summary["attempt_count"] == 1
    assert summary["best_score"] == 1
    assert summary["best_percentage"] == 33.3
    assert summary["document_name"] == "cell_biology.txt"

    b_ids = {q["id"] for q in as_user_b().get("/quizzes").json()}
    assert data["quiz_id"] not in b_ids


# --- Submission and grading -------------------------------------------------

def test_submit_scores_and_reveals_answers():
    data, _ = create_quiz()
    ids = question_ids(data["quiz_id"])

    res = as_user_a().post(f"/quizzes/{data['quiz_id']}/submit", json={"answers": [
        {"question_id": ids[0], "selected_answer": "  mitochondria "},  # trimmed, case-insensitive
        {"question_id": ids[1], "selected_answer": "ATP"},             # wrong
        # ids[2] left unanswered -> counts as wrong
    ]})

    assert res.status_code == 200
    body = res.json()
    assert body["score"] == 1
    assert body["total"] == 3
    assert body["percentage"] == 33.3
    results = {r["question_id"]: r for r in body["results"]}
    assert results[ids[0]]["is_correct"] is True
    assert results[ids[1]]["is_correct"] is False
    assert results[ids[1]]["correct_answer"] == "DNA"
    assert results[ids[1]]["explanation"] == "DNA encodes genetic instructions."
    assert results[ids[2]]["selected_answer"] is None
    assert results[ids[2]]["is_correct"] is False

    db = next(get_db())
    attempt = db.query(QuizAttempt).filter(QuizAttempt.id == body["attempt_id"]).first()
    assert (attempt.score, attempt.total_questions) == (1, 3)
    assert attempt.completed_at is not None
    assert db.query(QuizAnswer).filter(QuizAnswer.attempt_id == attempt.id).count() == 2


def test_submit_empty_answers_scores_zero():
    data, _ = create_quiz()
    res = as_user_a().post(f"/quizzes/{data['quiz_id']}/submit", json={"answers": []})
    assert res.status_code == 200
    assert (res.json()["score"], res.json()["total"]) == (0, 3)


def test_submit_rejects_duplicate_question_ids():
    data, _ = create_quiz()
    ids = question_ids(data["quiz_id"])
    res = as_user_a().post(f"/quizzes/{data['quiz_id']}/submit", json={"answers": [
        {"question_id": ids[0], "selected_answer": "Mitochondria"},
        {"question_id": ids[0], "selected_answer": "Nucleus"},
    ]})
    assert res.status_code == 422


def test_submit_rejects_question_from_another_quiz():
    first, _ = create_quiz()
    second, _ = create_quiz()
    other_question = question_ids(second["quiz_id"])[0]

    res = as_user_a().post(f"/quizzes/{first['quiz_id']}/submit", json={"answers": [
        {"question_id": other_question, "selected_answer": "Mitochondria"},
    ]})
    assert res.status_code == 422


def test_each_submission_creates_a_new_attempt():
    data, _ = create_quiz()
    ids = question_ids(data["quiz_id"])

    as_user_a().post(f"/quizzes/{data['quiz_id']}/submit", json={"answers": []})
    as_user_a().post(f"/quizzes/{data['quiz_id']}/submit", json={"answers": [
        {"question_id": i, "selected_answer": a}
        for i, a in zip(ids, ["Mitochondria", "DNA", "Ribosome"])
    ]})

    attempts = as_user_a().get(f"/quizzes/{data['quiz_id']}/attempts").json()
    assert len(attempts) == 2
    assert attempts[0]["score"] == 3  # newest first
    assert attempts[1]["score"] == 0

    detail = as_user_a().get(f"/quizzes/attempts/{attempts[0]['attempt_id']}").json()
    assert all(r["is_correct"] for r in detail["results"])


# --- Ownership --------------------------------------------------------------

def test_other_user_cannot_access_quiz_or_attempts():
    data, _ = create_quiz()
    quiz_id = data["quiz_id"]
    ids = question_ids(quiz_id)
    attempt_id = as_user_a().post(f"/quizzes/{quiz_id}/submit", json={"answers": []}).json()["attempt_id"]

    assert as_user_b().get(f"/quizzes/{quiz_id}").status_code == 404
    assert as_user_b().post(f"/quizzes/{quiz_id}/submit", json={
        "answers": [{"question_id": ids[0], "selected_answer": "Mitochondria"}],
    }).status_code == 404
    assert as_user_b().get(f"/quizzes/{quiz_id}/attempts").status_code == 404
    assert as_user_b().get(f"/quizzes/attempts/{attempt_id}").status_code == 404
    assert as_user_b().delete(f"/quizzes/{quiz_id}").status_code == 404

    # Still intact for the owner
    assert as_user_a().get(f"/quizzes/{quiz_id}").status_code == 200


def test_delete_quiz_cascades():
    data, _ = create_quiz()
    quiz_id = data["quiz_id"]
    attempt_id = as_user_a().post(f"/quizzes/{quiz_id}/submit", json={"answers": [
        {"question_id": question_ids(quiz_id)[0], "selected_answer": "Mitochondria"},
    ]}).json()["attempt_id"]

    res = as_user_a().delete(f"/quizzes/{quiz_id}")
    assert res.status_code == 200

    db = next(get_db())
    assert db.query(Quiz).filter(Quiz.id == quiz_id).first() is None
    assert db.query(QuizQuestion).filter(QuizQuestion.quiz_id == quiz_id).count() == 0
    assert db.query(QuizAttempt).filter(QuizAttempt.id == attempt_id).first() is None
    assert db.query(QuizAnswer).filter(QuizAnswer.attempt_id == attempt_id).count() == 0
    assert as_user_a().get(f"/quizzes/{quiz_id}").status_code == 404
