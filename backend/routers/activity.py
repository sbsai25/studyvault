from datetime import date, datetime, timedelta
from typing import Iterable

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.deps import get_current_user
from backend.models.user import User
from backend.models.activity import Activity
from backend.models.document import Document
from backend.models.flashcard import FlashcardSet, Flashcard, FlashcardProgress
from backend.models.fill_blank import FillBlankSet, FillBlankAttempt
from backend.services import activity

router = APIRouter(tags=["activity"])

DAILY_ACTIVITY_DAYS = 14


def compute_streaks(active_days: Iterable[date], today: date) -> tuple[int, int]:
    """Returns (current, longest) streaks of consecutive UTC days with activity.

    The current streak counts back from today if there was activity today,
    otherwise from yesterday (so it doesn't reset before the day is over);
    with no activity on either day it is 0.
    """
    days = set(active_days)

    longest = 0
    for d in days:
        if d - timedelta(days=1) not in days:  # start of a run
            length = 1
            while d + timedelta(days=length) in days:
                length += 1
            longest = max(longest, length)

    start = today if today in days else today - timedelta(days=1)
    current = 0
    while start - timedelta(days=current) in days:
        current += 1

    return current, longest


def _average_percentage(attempts) -> float | None:
    scored = [a for a in attempts if a.total_questions]
    if not scored:
        return None
    return round(sum(100 * a.score / a.total_questions for a in scored) / len(scored), 1)


@router.get("/activity")
def list_activity(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    events = (
        db.query(Activity)
        .filter(Activity.user_id == user.id)
        .order_by(Activity.created_at.desc(), Activity.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        {
            "id": e.id,
            "activity_type": e.activity_type,
            "related_entity_id": e.related_entity_id,
            "metadata": e.metadata_data,
            "created_at": e.created_at,
        }
        for e in events
    ]


@router.get("/stats")
def get_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.utcnow()
    today = now.date()

    card_ids = (
        db.query(Flashcard.id)
        .join(FlashcardSet, Flashcard.flashcard_set_id == FlashcardSet.id)
        .filter(FlashcardSet.user_id == user.id)
    )
    total_cards = card_ids.count()
    reviewed_cards = (
        db.query(FlashcardProgress)
        .filter(FlashcardProgress.user_id == user.id, FlashcardProgress.flashcard_id.in_(card_ids))
        .count()
    )
    cards_due = (
        db.query(FlashcardProgress)
        .filter(
            FlashcardProgress.user_id == user.id,
            FlashcardProgress.next_review_at.isnot(None),
            FlashcardProgress.next_review_at <= now,
        )
        .count()
    )

    reviews_last_7_days = (
        db.query(Activity)
        .filter(
            Activity.user_id == user.id,
            Activity.activity_type == activity.FLASHCARD_REVIEWED,
            Activity.created_at >= now - timedelta(days=7),
        )
        .count()
    )

    fill_blank_attempts = db.query(FillBlankAttempt).filter(FillBlankAttempt.user_id == user.id).all()

    # Activity per UTC day, for the chart and the streaks
    day_column = func.date(Activity.created_at)
    counts_by_day = {
        (d if isinstance(d, date) else date.fromisoformat(str(d))): n
        for d, n in (
            db.query(day_column, func.count(Activity.id))
            .filter(Activity.user_id == user.id)
            .group_by(day_column)
            .all()
        )
    }
    daily_activity = [
        {"date": day.isoformat(), "count": counts_by_day.get(day, 0)}
        for day in (today - timedelta(days=i) for i in range(DAILY_ACTIVITY_DAYS - 1, -1, -1))
    ]
    current_streak, longest_streak = compute_streaks(counts_by_day, today)

    return {
        "documents": db.query(Document).filter(Document.user_id == user.id).count(),
        "flashcard_sets": db.query(FlashcardSet).filter(FlashcardSet.user_id == user.id).count(),
        "flashcards": total_cards,
        "flashcards_never_reviewed": total_cards - reviewed_cards,
        "cards_due_now": cards_due,
        "reviews_last_7_days": reviews_last_7_days,
        "fill_blank_sets": db.query(FillBlankSet).filter(FillBlankSet.user_id == user.id).count(),
        "fill_blank_attempts": len(fill_blank_attempts),
        "average_fill_blank_percentage": _average_percentage(fill_blank_attempts),
        "daily_activity": daily_activity,
        "current_streak_days": current_streak,
        "longest_streak_days": longest_streak,
    }
