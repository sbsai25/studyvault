from datetime import datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.models.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
    )
    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    documents = relationship("Document", back_populates="user", cascade="all, delete-orphan")
    chunks = relationship("Chunk", back_populates="user", cascade="all, delete-orphan")
    activities = relationship("Activity", back_populates="user", cascade="all, delete-orphan")
    flashcard_sets = relationship("FlashcardSet", cascade="all, delete-orphan")
    flashcard_progress = relationship("FlashcardProgress", cascade="all, delete-orphan")
    quizzes = relationship("Quiz", cascade="all, delete-orphan")
    quiz_attempts = relationship("QuizAttempt", cascade="all, delete-orphan")
    fill_blank_sets = relationship("FillBlankSet", cascade="all, delete-orphan")
    fill_blank_attempts = relationship("FillBlankAttempt", cascade="all, delete-orphan")
    refresh_tokens = relationship("RefreshToken", cascade="all, delete-orphan")

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )