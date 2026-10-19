from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.models.base import Base

class FlashcardSet(Base):
    __tablename__ = "flashcard_sets"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    flashcards = relationship("Flashcard", back_populates="flashcard_set", cascade="all, delete-orphan")


from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint

class Flashcard(Base):
    __tablename__ = "flashcards"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    flashcard_set_id: Mapped[int] = mapped_column(
        ForeignKey("flashcard_sets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    flashcard_set = relationship("FlashcardSet", back_populates="flashcards")
    progresses = relationship("FlashcardProgress", back_populates="flashcard", cascade="all, delete-orphan")


class FlashcardProgress(Base):
    __tablename__ = "flashcard_progress"
    __table_args__ = (
        UniqueConstraint('user_id', 'flashcard_id', name='uq_flashcard_progress_user_flashcard'),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    flashcard_id: Mapped[int] = mapped_column(
        ForeignKey("flashcards.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    review_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    difficulty: Mapped[str | None] = mapped_column(String(50), nullable=True)
    next_review_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Spaced-repetition state (modified SM-2, see routers/flashcards.py)
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5, server_default="2.5", nullable=False)
    interval_days: Mapped[float] = mapped_column(Float, default=0.0, server_default="0", nullable=False)
    repetitions: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    flashcard = relationship("Flashcard", back_populates="progresses")
