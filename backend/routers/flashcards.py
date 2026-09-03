from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.database import get_db
from backend.deps import get_current_user
from backend.models.user import User
from backend.models.document import Document
from backend.models.flashcard import FlashcardSet, Flashcard, FlashcardProgress

router = APIRouter(prefix="/flashcards", tags=["flashcards"])

REVIEW_INTERVALS = {
    "again": timedelta(minutes=10),
    "hard": timedelta(days=1),
    "good": timedelta(days=3),
    "easy": timedelta(days=7),
}


class ReviewRequest(BaseModel):
    difficulty: str


def _progress_dict(p: FlashcardProgress | None):
    if not p:
        return None
    return {
        "review_count": p.review_count,
        "difficulty": p.difficulty,
        "last_reviewed_at": p.last_reviewed_at,
        "next_review_at": p.next_review_at,
    }


@router.get("/due")
def get_due_flashcards(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.utcnow()
    rows = (
        db.query(FlashcardProgress, Flashcard)
        .join(Flashcard, FlashcardProgress.flashcard_id == Flashcard.id)
        .filter(
            FlashcardProgress.user_id == user.id,
            FlashcardProgress.next_review_at.isnot(None),
            FlashcardProgress.next_review_at <= now,
        )
        .order_by(FlashcardProgress.next_review_at.asc())
        .all()
    )
    return [
        {
            "id": card.id,
            "question": card.question,
            "answer": card.answer,
            "flashcard_set_id": card.flashcard_set_id,
            "next_review_at": progress.next_review_at,
        }
        for progress, card in rows
    ]


@router.get("")
def list_flashcard_sets(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sets = (
        db.query(FlashcardSet)
        .filter(FlashcardSet.user_id == user.id)
        .order_by(FlashcardSet.created_at.desc())
        .all()
    )

    result = []
    for s in sets:
        card_count = db.query(Flashcard).filter(Flashcard.flashcard_set_id == s.id).count()
        doc = db.query(Document).filter(Document.id == s.document_id).first() if s.document_id else None
        result.append({
            "id": s.id,
            "title": s.title,
            "document_id": s.document_id,
            "document_name": doc.filename if doc else None,
            "number_of_cards": card_count,
            "created_at": s.created_at,
        })
    return result


@router.get("/{set_id}")
def get_flashcard_set(set_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    flashcard_set = db.query(FlashcardSet).filter(
        FlashcardSet.id == set_id, FlashcardSet.user_id == user.id
    ).first()
    if not flashcard_set:
        raise HTTPException(status_code=404, detail="Flashcard set not found")

    cards = db.query(Flashcard).filter(
        Flashcard.flashcard_set_id == flashcard_set.id
    ).order_by(Flashcard.id.asc()).all()

    progress_by_card = {}
    if cards:
        progresses = db.query(FlashcardProgress).filter(
            FlashcardProgress.user_id == user.id,
            FlashcardProgress.flashcard_id.in_([c.id for c in cards]),
        ).all()
        progress_by_card = {p.flashcard_id: p for p in progresses}

    return {
        "id": flashcard_set.id,
        "title": flashcard_set.title,
        "document_id": flashcard_set.document_id,
        "created_at": flashcard_set.created_at,
        "cards": [
            {
                "id": c.id,
                "question": c.question,
                "answer": c.answer,
                "progress": _progress_dict(progress_by_card.get(c.id)),
            }
            for c in cards
        ],
    }


@router.post("/{flashcard_id}/review")
def review_flashcard(
    flashcard_id: int,
    request: ReviewRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    difficulty = request.difficulty.strip().lower()
    if difficulty not in REVIEW_INTERVALS:
        raise HTTPException(
            status_code=422,
            detail="difficulty must be one of: again, hard, good, easy",
        )

    card = db.query(Flashcard).join(
        FlashcardSet, Flashcard.flashcard_set_id == FlashcardSet.id
    ).filter(
        Flashcard.id == flashcard_id, FlashcardSet.user_id == user.id
    ).first()
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found")

    now = datetime.utcnow()
    next_review_at = now + REVIEW_INTERVALS[difficulty]

    progress = db.query(FlashcardProgress).filter(
        FlashcardProgress.user_id == user.id,
        FlashcardProgress.flashcard_id == flashcard_id,
    ).first()

    if progress:
        progress.review_count += 1
        progress.last_reviewed_at = now
        progress.difficulty = difficulty
        progress.next_review_at = next_review_at
    else:
        progress = FlashcardProgress(
            user_id=user.id,
            flashcard_id=flashcard_id,
            review_count=1,
            last_reviewed_at=now,
            difficulty=difficulty,
            next_review_at=next_review_at,
        )
        db.add(progress)

    db.commit()
    db.refresh(progress)

    return _progress_dict(progress)


@router.delete("/{set_id}")
def delete_flashcard_set(set_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    flashcard_set = db.query(FlashcardSet).filter(
        FlashcardSet.id == set_id, FlashcardSet.user_id == user.id
    ).first()
    if not flashcard_set:
        raise HTTPException(status_code=404, detail="Flashcard set not found")

    db.delete(flashcard_set)
    db.commit()

    return {"message": "Flashcard set deleted successfully"}
