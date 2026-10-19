from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.models.base import Base


class FillBlankSet(Base):
    __tablename__ = "fill_blank_sets"

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

    questions = relationship("FillBlankQuestion", back_populates="fill_blank_set", cascade="all, delete-orphan")
    attempts = relationship("FillBlankAttempt", back_populates="fill_blank_set", cascade="all, delete-orphan")


class FillBlankQuestion(Base):
    __tablename__ = "fill_blank_questions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    fill_blank_set_id: Mapped[int] = mapped_column(
        ForeignKey("fill_blank_sets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Contains exactly one "____" where the answer goes
    sentence: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    # Other answers that also count as correct (list of strings)
    accepted_answers: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    hint: Mapped[str | None] = mapped_column(Text, nullable=True)

    fill_blank_set = relationship("FillBlankSet", back_populates="questions")


class FillBlankAttempt(Base):
    __tablename__ = "fill_blank_attempts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    fill_blank_set_id: Mapped[int] = mapped_column(
        ForeignKey("fill_blank_sets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    # [{"question_id": int, "answer": str, "is_correct": bool}] for answered questions
    answers: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    completed_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    fill_blank_set = relationship("FillBlankSet", back_populates="attempts")
