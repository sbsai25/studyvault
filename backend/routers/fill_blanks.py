from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.database import get_db
from backend.deps import get_current_user
from backend.models.user import User
from backend.models.document import Document
from backend.models.fill_blank import FillBlankSet, FillBlankQuestion, FillBlankAttempt
from backend.services import activity
from backend.services.activity import log_activity

router = APIRouter(prefix="/fill-blanks", tags=["fill-blanks"])

# Sentence punctuation, quotes and brackets stripped from the ends of an
# answer only. Punctuation inside an answer ("co-op", "3.5") is kept, and so
# are symbols that change meaning at the ends ("C++", "C#", "-5").
EDGE_PUNCTUATION = ".,;:!?\"'()[]{}“”‘’«»…"


class BlankAnswer(BaseModel):
    question_id: int
    answer: str


class SubmitFillBlanksRequest(BaseModel):
    answers: List[BlankAnswer]


def normalize_answer(text: str) -> str:
    """Casefold, collapse inner whitespace, strip leading/trailing punctuation."""
    text = " ".join(text.casefold().split())
    return text.strip(EDGE_PUNCTUATION + " ")


def is_correct(submitted: str, question: FillBlankQuestion) -> bool:
    given = normalize_answer(submitted)
    if not given:
        return False
    accepted = [question.answer, *(question.accepted_answers or [])]
    return any(given == normalize_answer(a) for a in accepted)


def _percentage(score: int, total: int) -> float:
    return round(100 * score / total, 1) if total else 0.0


def _get_owned_set(set_id: int, user: User, db: Session) -> FillBlankSet:
    fill_blank_set = db.query(FillBlankSet).filter(
        FillBlankSet.id == set_id, FillBlankSet.user_id == user.id
    ).first()
    if not fill_blank_set:
        raise HTTPException(status_code=404, detail="Fill-in-the-blank set not found")
    return fill_blank_set


def _questions(set_id: int, db: Session) -> List[FillBlankQuestion]:
    return (
        db.query(FillBlankQuestion)
        .filter(FillBlankQuestion.fill_blank_set_id == set_id)
        .order_by(FillBlankQuestion.id.asc())
        .all()
    )


def _attempt_summary(attempt: FillBlankAttempt):
    return {
        "attempt_id": attempt.id,
        "fill_blank_set_id": attempt.fill_blank_set_id,
        "score": attempt.score,
        "total": attempt.total_questions,
        "percentage": _percentage(attempt.score, attempt.total_questions),
        "completed_at": attempt.completed_at,
    }


def _attempt_detail(attempt: FillBlankAttempt, db: Session):
    answers = {a["question_id"]: a for a in attempt.answers or []}
    results = []
    for q in _questions(attempt.fill_blank_set_id, db):
        answer = answers.get(q.id)
        results.append({
            "question_id": q.id,
            "sentence": q.sentence,
            "submitted_answer": answer["answer"] if answer else None,
            "is_correct": answer["is_correct"] if answer else False,
            "correct_answer": q.answer,
            "accepted_answers": q.accepted_answers or [],
            "hint": q.hint,
        })
    return {**_attempt_summary(attempt), "results": results}


@router.get("")
def list_fill_blank_sets(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sets = (
        db.query(FillBlankSet)
        .filter(FillBlankSet.user_id == user.id)
        .order_by(FillBlankSet.created_at.desc(), FillBlankSet.id.desc())
        .all()
    )

    result = []
    for s in sets:
        question_count = db.query(FillBlankQuestion).filter(FillBlankQuestion.fill_blank_set_id == s.id).count()
        attempts = db.query(FillBlankAttempt).filter(
            FillBlankAttempt.fill_blank_set_id == s.id, FillBlankAttempt.user_id == user.id
        ).all()
        best = max(attempts, key=lambda a: a.score, default=None)
        doc = db.query(Document).filter(Document.id == s.document_id).first() if s.document_id else None
        result.append({
            "id": s.id,
            "title": s.title,
            "document_id": s.document_id,
            "document_name": doc.filename if doc else None,
            "number_of_questions": question_count,
            "attempt_count": len(attempts),
            "best_score": best.score if best else None,
            "best_percentage": _percentage(best.score, best.total_questions) if best else None,
            "created_at": s.created_at,
        })
    return result


@router.get("/attempts/{attempt_id}")
def get_attempt(attempt_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    attempt = db.query(FillBlankAttempt).filter(
        FillBlankAttempt.id == attempt_id, FillBlankAttempt.user_id == user.id
    ).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    return _attempt_detail(attempt, db)


@router.get("/{set_id}")
def get_fill_blank_set(set_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    fill_blank_set = _get_owned_set(set_id, user, db)
    questions = _questions(fill_blank_set.id, db)

    # Answers are only revealed after submitting
    return {
        "id": fill_blank_set.id,
        "title": fill_blank_set.title,
        "document_id": fill_blank_set.document_id,
        "created_at": fill_blank_set.created_at,
        "number_of_questions": len(questions),
        "questions": [
            {"id": q.id, "sentence": q.sentence, "hint": q.hint}
            for q in questions
        ],
    }


@router.post("/{set_id}/submit")
def submit_fill_blanks(
    set_id: int,
    request: SubmitFillBlanksRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    fill_blank_set = _get_owned_set(set_id, user, db)
    questions = {q.id: q for q in _questions(fill_blank_set.id, db)}

    submitted_ids = [a.question_id for a in request.answers]
    if len(submitted_ids) != len(set(submitted_ids)):
        raise HTTPException(status_code=422, detail="Each question can only be answered once")
    unknown = [qid for qid in submitted_ids if qid not in questions]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Questions not in this set: {unknown}")

    # Unanswered questions have no entry and count as wrong
    answers = [
        {
            "question_id": a.question_id,
            "answer": a.answer,
            "is_correct": is_correct(a.answer, questions[a.question_id]),
        }
        for a in request.answers
    ]
    attempt = FillBlankAttempt(
        user_id=user.id,
        fill_blank_set_id=fill_blank_set.id,
        score=sum(1 for a in answers if a["is_correct"]),
        total_questions=len(questions),
        answers=answers,
        completed_at=datetime.utcnow(),
    )
    db.add(attempt)
    db.flush()
    log_activity(db, user.id, activity.FILL_BLANKS_SUBMITTED, fill_blank_set.id, {
        "attempt_id": attempt.id,
        "score": attempt.score,
        "total": attempt.total_questions,
        "percentage": _percentage(attempt.score, attempt.total_questions),
    })
    db.commit()
    db.refresh(attempt)

    return _attempt_detail(attempt, db)


@router.get("/{set_id}/attempts")
def list_attempts(set_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    fill_blank_set = _get_owned_set(set_id, user, db)
    attempts = (
        db.query(FillBlankAttempt)
        .filter(FillBlankAttempt.fill_blank_set_id == fill_blank_set.id, FillBlankAttempt.user_id == user.id)
        .order_by(FillBlankAttempt.completed_at.desc(), FillBlankAttempt.id.desc())
        .all()
    )
    return [_attempt_summary(a) for a in attempts]


@router.delete("/{set_id}")
def delete_fill_blank_set(set_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    fill_blank_set = _get_owned_set(set_id, user, db)
    db.delete(fill_blank_set)
    db.commit()
    return {"message": "Fill-in-the-blank set deleted successfully"}
