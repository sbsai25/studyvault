from dataclasses import dataclass
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.database import get_db
from backend.deps import get_current_user
from backend.models.user import User
from backend.models.document import Document
from backend.models.flashcard import FlashcardSet, Flashcard, FlashcardProgress

router = APIRouter(prefix="/flashcards", tags=["flashcards"])

# SM-2 quality score for each button
RATING_QUALITY = {"again": 1, "hard": 3, "good": 4, "easy": 5}
AGAIN_DELAY = timedelta(minutes=10)
FIRST_INTERVAL_DAYS = 1.0
SECOND_INTERVAL_DAYS = 6.0
HARD_MULTIPLIER = 0.8
EASY_MULTIPLIER = 1.3
DEFAULT_EASE = 2.5
MIN_EASE = 1.3


@dataclass
class ReviewSchedule:
    ease_factor: float
    interval_days: float
    repetitions: int
    next_review_at: datetime


def schedule_review(
    ease_factor: float,
    interval_days: float,
    repetitions: int,
    rating: str,
    now: datetime,
) -> ReviewSchedule:
    """Modified SM-2 scheduling for one review.

    - again: repetitions reset to 0 and the card comes back in 10 minutes.
    - Otherwise repetitions += 1 and the interval is 1 day for the first
      successful review, 6 days for the second, and after that
      previous interval x ease factor (x0.8 for hard, x1.3 for easy).
    - The interval is computed with the ease factor *before* this review;
      the ease factor is then updated for the next review with the standard
      SM-2 formula  EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
      never going below 1.3.

    Differences from textbook SM-2: a fixed 10-minute relearn delay instead
    of 1 day, and the hard/easy multipliers.
    """
    quality = RATING_QUALITY[rating]

    if rating == "again":
        repetitions = 0
        interval_days = 0.0
        next_review_at = now + AGAIN_DELAY
    else:
        repetitions += 1
        if repetitions == 1:
            interval_days = FIRST_INTERVAL_DAYS
        elif repetitions == 2:
            interval_days = SECOND_INTERVAL_DAYS
        else:
            interval_days = interval_days * ease_factor
            if rating == "hard":
                interval_days *= HARD_MULTIPLIER
            elif rating == "easy":
                interval_days *= EASY_MULTIPLIER
        interval_days = round(interval_days, 2)
        next_review_at = now + timedelta(days=interval_days)

    ease_factor += 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    ease_factor = round(max(MIN_EASE, ease_factor), 2)

    return ReviewSchedule(ease_factor, interval_days, repetitions, next_review_at)


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
        "ease_factor": p.ease_factor,
        "interval_days": p.interval_days,
        "repetitions": p.repetitions,
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


@router.get("/{set_id}/due")
def get_due_flashcards_in_set(set_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Cards in one deck to study now: due for review, or never reviewed."""
    flashcard_set = db.query(FlashcardSet).filter(
        FlashcardSet.id == set_id, FlashcardSet.user_id == user.id
    ).first()
    if not flashcard_set:
        raise HTTPException(status_code=404, detail="Flashcard set not found")

    now = datetime.utcnow()
    rows = (
        db.query(Flashcard, FlashcardProgress)
        .outerjoin(
            FlashcardProgress,
            (FlashcardProgress.flashcard_id == Flashcard.id) & (FlashcardProgress.user_id == user.id),
        )
        .filter(
            Flashcard.flashcard_set_id == flashcard_set.id,
            or_(FlashcardProgress.id.is_(None), FlashcardProgress.next_review_at <= now),
        )
        .order_by(FlashcardProgress.next_review_at.asc().nullsfirst(), Flashcard.id.asc())
        .all()
    )
    return {
        "id": flashcard_set.id,
        "title": flashcard_set.title,
        "cards": [
            {
                "id": card.id,
                "question": card.question,
                "answer": card.answer,
                "progress": _progress_dict(progress),
            }
            for card, progress in rows
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
    if difficulty not in RATING_QUALITY:
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

    progress = db.query(FlashcardProgress).filter(
        FlashcardProgress.user_id == user.id,
        FlashcardProgress.flashcard_id == flashcard_id,
    ).first()

    if not progress:
        progress = FlashcardProgress(
            user_id=user.id,
            flashcard_id=flashcard_id,
            review_count=0,
            ease_factor=DEFAULT_EASE,
            interval_days=0.0,
            repetitions=0,
        )
        db.add(progress)

    schedule = schedule_review(
        progress.ease_factor, progress.interval_days, progress.repetitions, difficulty, now
    )
    progress.review_count += 1
    progress.last_reviewed_at = now
    progress.difficulty = difficulty
    progress.next_review_at = schedule.next_review_at
    progress.ease_factor = schedule.ease_factor
    progress.interval_days = schedule.interval_days
    progress.repetitions = schedule.repetitions

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
