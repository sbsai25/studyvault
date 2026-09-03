from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.models.base import Base

# Fallback to JSON if JSONB is not heavily strictly required, but since we use PostgreSQL, JSONB is preferred.
# SQLAlchemy's JSON type works across dialects, but we will use JSON for generic compatibility if they ever switch, 
# or just JSON since it's standard. Let's use JSON.

class Quiz(Base):
    __tablename__ = "quizzes"

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

    questions = relationship("QuizQuestion", back_populates="quiz", cascade="all, delete-orphan")
    attempts = relationship("QuizAttempt", back_populates="quiz", cascade="all, delete-orphan")


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    quiz_id: Mapped[int] = mapped_column(
        ForeignKey("quizzes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[list] = mapped_column(JSON, nullable=False) # list of strings
    correct_answer: Mapped[str] = mapped_column(Text, nullable=False)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)

    quiz = relationship("Quiz", back_populates="questions")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quiz_id: Mapped[int] = mapped_column(
        ForeignKey("quizzes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    quiz = relationship("Quiz", back_populates="attempts")
    answers = relationship("QuizAnswer", back_populates="attempt", cascade="all, delete-orphan")


class QuizAnswer(Base):
    __tablename__ = "quiz_answers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("quiz_attempts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("quiz_questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    selected_answer: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(default=False, nullable=False)

    attempt = relationship("QuizAttempt", back_populates="answers")
    question = relationship("QuizQuestion")
