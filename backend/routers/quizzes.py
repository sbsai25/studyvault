from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.database import get_db
from backend.deps import get_current_user
from backend.models.user import User
from backend.models.document import Document
from backend.models.quiz import Quiz, QuizQuestion, QuizAttempt, QuizAnswer

router = APIRouter(prefix="/quizzes", tags=["quizzes"])


class AnswerSubmission(BaseModel):
    question_id: int
    selected_answer: str


class SubmitQuizRequest(BaseModel):
    answers: List[AnswerSubmission]


def _is_correct(selected: str, correct: str) -> bool:
    return selected.strip().casefold() == correct.strip().casefold()


def _percentage(score: int, total: int) -> float:
    return round(100 * score / total, 1) if total else 0.0


def _get_owned_quiz(quiz_id: int, user: User, db: Session) -> Quiz:
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id, Quiz.user_id == user.id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz


def _questions(quiz_id: int, db: Session) -> List[QuizQuestion]:
    return (
        db.query(QuizQuestion)
        .filter(QuizQuestion.quiz_id == quiz_id)
        .order_by(QuizQuestion.id.asc())
        .all()
    )


def _attempt_summary(attempt: QuizAttempt):
    return {
        "attempt_id": attempt.id,
        "quiz_id": attempt.quiz_id,
        "score": attempt.score,
        "total": attempt.total_questions,
        "percentage": _percentage(attempt.score, attempt.total_questions),
        "started_at": attempt.started_at,
        "completed_at": attempt.completed_at,
    }


def _attempt_detail(attempt: QuizAttempt, db: Session):
    answers = {
        a.question_id: a
        for a in db.query(QuizAnswer).filter(QuizAnswer.attempt_id == attempt.id).all()
    }
    results = []
    for q in _questions(attempt.quiz_id, db):
        answer = answers.get(q.id)
        results.append({
            "question_id": q.id,
            "question": q.question,
            "options": q.options,
            "selected_answer": answer.selected_answer if answer else None,
            "is_correct": answer.is_correct if answer else False,
            "correct_answer": q.correct_answer,
            "explanation": q.explanation,
        })
    return {**_attempt_summary(attempt), "results": results}


@router.get("")
def list_quizzes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    quizzes = (
        db.query(Quiz)
        .filter(Quiz.user_id == user.id)
        .order_by(Quiz.created_at.desc(), Quiz.id.desc())
        .all()
    )

    result = []
    for quiz in quizzes:
        question_count = db.query(QuizQuestion).filter(QuizQuestion.quiz_id == quiz.id).count()
        attempts = db.query(QuizAttempt).filter(
            QuizAttempt.quiz_id == quiz.id, QuizAttempt.user_id == user.id
        ).all()
        best = max(attempts, key=lambda a: a.score, default=None)
        doc = db.query(Document).filter(Document.id == quiz.document_id).first() if quiz.document_id else None
        result.append({
            "id": quiz.id,
            "title": quiz.title,
            "document_id": quiz.document_id,
            "document_name": doc.filename if doc else None,
            "number_of_questions": question_count,
            "attempt_count": len(attempts),
            "best_score": best.score if best else None,
            "best_percentage": _percentage(best.score, best.total_questions) if best else None,
            "created_at": quiz.created_at,
        })
    return result


@router.get("/attempts/{attempt_id}")
def get_attempt(attempt_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    attempt = db.query(QuizAttempt).filter(
        QuizAttempt.id == attempt_id, QuizAttempt.user_id == user.id
    ).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    return _attempt_detail(attempt, db)


@router.get("/{quiz_id}")
def get_quiz(quiz_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    quiz = _get_owned_quiz(quiz_id, user, db)
    questions = _questions(quiz.id, db)

    # Answers and explanations are only revealed after submitting
    return {
        "id": quiz.id,
        "title": quiz.title,
        "document_id": quiz.document_id,
        "created_at": quiz.created_at,
        "number_of_questions": len(questions),
        "questions": [
            {"id": q.id, "question": q.question, "options": q.options}
            for q in questions
        ],
    }


@router.post("/{quiz_id}/submit")
def submit_quiz(
    quiz_id: int,
    request: SubmitQuizRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    quiz = _get_owned_quiz(quiz_id, user, db)
    questions = {q.id: q for q in _questions(quiz.id, db)}

    submitted_ids = [a.question_id for a in request.answers]
    if len(submitted_ids) != len(set(submitted_ids)):
        raise HTTPException(status_code=422, detail="Each question can only be answered once")
    unknown = [qid for qid in submitted_ids if qid not in questions]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Questions not in this quiz: {unknown}")

    now = datetime.utcnow()
    attempt = QuizAttempt(
        user_id=user.id,
        quiz_id=quiz.id,
        total_questions=len(questions),
        started_at=now,
        completed_at=now,
    )
    # Unanswered questions simply have no QuizAnswer row and count as wrong
    attempt.answers = [
        QuizAnswer(
            question_id=a.question_id,
            selected_answer=a.selected_answer,
            is_correct=_is_correct(a.selected_answer, questions[a.question_id].correct_answer),
        )
        for a in request.answers
    ]
    attempt.score = sum(1 for a in attempt.answers if a.is_correct)
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    return _attempt_detail(attempt, db)


@router.get("/{quiz_id}/attempts")
def list_attempts(quiz_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    quiz = _get_owned_quiz(quiz_id, user, db)
    attempts = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.quiz_id == quiz.id, QuizAttempt.user_id == user.id)
        .order_by(QuizAttempt.completed_at.desc(), QuizAttempt.id.desc())
        .all()
    )
    return [_attempt_summary(a) for a in attempts]


@router.delete("/{quiz_id}")
def delete_quiz(quiz_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    quiz = _get_owned_quiz(quiz_id, user, db)
    db.delete(quiz)
    db.commit()
    return {"message": "Quiz deleted successfully"}
