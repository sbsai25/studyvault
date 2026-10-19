import os
import re
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from backend.database import get_db
from backend.deps import get_current_user
from backend.models.user import User
from backend.models.document import Document
from backend.models.chunk import Chunk
from backend.models.flashcard import FlashcardSet, Flashcard
from backend.models.quiz import Quiz, QuizQuestion
from backend.models.fill_blank import FillBlankSet, FillBlankQuestion
from backend.services import activity
from backend.services.activity import log_activity
from backend.services.rag import generate_flashcards, generate_quiz, generate_fill_blanks

router = APIRouter(prefix="/tools", tags=["tools"])

class ToolRequest(BaseModel):
    document_id: int


class QuizRequest(ToolRequest):
    num_questions: int = Field(5, ge=3, le=20)


class FillBlanksRequest(ToolRequest):
    num_questions: int = Field(10, ge=3, le=20)


def _title_from_filename(filename: str, suffix: str = "Flashcards") -> str:
    name = os.path.splitext(filename)[0]
    name = re.sub(r"[_\-]+", " ", name).strip()
    return f"{name.title()} {suffix}" if name else suffix


CONTEXT_SEPARATOR = "\n\n"
MAX_CONTEXT_CHARS = 24000


def _evenly_spaced(n: int, k: int) -> List[int]:
    """k distinct indices spread across range(n), always including 0 and n-1."""
    if k <= 1:
        return [0]
    return sorted({round(i * (n - 1) / (k - 1)) for i in range(k)})


def _document_context(texts: List[str], max_chars: int = MAX_CONTEXT_CHARS) -> str:
    """Builds generation context that covers the whole document.

    `texts` are the chunk contents in document order. If they don't all fit in
    `max_chars`, the largest number of evenly spaced chunks that does fit is
    used (first and last chunk always included, document order kept). If even
    a single chunk is too long, the first chunk is truncated to the budget.
    """
    n = len(texts)

    def size(indices):
        return sum(len(texts[i]) for i in indices) + len(CONTEXT_SEPARATOR) * (len(indices) - 1)

    shortest = min((len(t) for t in texts), default=0)
    k = min(n, max_chars // (shortest + len(CONTEXT_SEPARATOR)) + 1)
    while k >= 1:
        indices = _evenly_spaced(n, k)
        if size(indices) <= max_chars:
            return CONTEXT_SEPARATOR.join(texts[i] for i in indices)
        k -= 1
    return texts[0][:max_chars] if texts else ""


def _owned_document_context(document_id: int, user: User, db: Session):
    doc = db.query(Document).filter(Document.id == document_id, Document.user_id == user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    chunks = (
        db.query(Chunk)
        .filter(Chunk.document_id == doc.id)
        .order_by(Chunk.chunk_index.asc())
        .all()
    )
    if not chunks:
        raise HTTPException(status_code=400, detail="Document has no content")

    return doc, _document_context([c.content for c in chunks])


@router.post("/flashcards")
def create_flashcards(request: ToolRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc, context_text = _owned_document_context(request.document_id, user, db)

    cards_data = generate_flashcards(context_text)
    if not cards_data:
        raise HTTPException(status_code=502, detail="Failed to generate flashcards from this document")

    flashcard_set = FlashcardSet(
        user_id=user.id,
        document_id=doc.id,
        title=_title_from_filename(doc.filename),
    )
    db.add(flashcard_set)
    db.commit()
    db.refresh(flashcard_set)

    cards = [
        Flashcard(
            flashcard_set_id=flashcard_set.id,
            question=c["question"],
            answer=c["answer"],
        )
        for c in cards_data
        if c.get("question") and c.get("answer")
    ]
    db.add_all(cards)
    log_activity(db, user.id, activity.FLASHCARDS_GENERATED, flashcard_set.id, {
        "document_id": doc.id,
        "number_of_cards": len(cards),
    })
    db.commit()

    return {
        "flashcard_set_id": flashcard_set.id,
        "title": flashcard_set.title,
        "number_of_cards": len(cards),
    }

@router.post("/quiz")
def create_quiz(request: QuizRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc, context_text = _owned_document_context(request.document_id, user, db)

    questions = generate_quiz(context_text, count=request.num_questions)
    if not questions:
        raise HTTPException(status_code=502, detail="Failed to generate a quiz from this document")

    quiz = Quiz(
        user_id=user.id,
        document_id=doc.id,
        title=_title_from_filename(doc.filename, "Quiz"),
    )
    quiz.questions = [
        QuizQuestion(
            question=q["question"],
            options=q["options"],
            correct_answer=q["correct_answer"],
            explanation=q.get("explanation"),
        )
        for q in questions
    ]
    db.add(quiz)
    db.flush()
    log_activity(db, user.id, activity.QUIZ_GENERATED, quiz.id, {
        "document_id": doc.id,
        "number_of_questions": len(questions),
    })
    db.commit()
    db.refresh(quiz)

    return {
        "quiz_id": quiz.id,
        "title": quiz.title,
        "number_of_questions": len(questions),
        # Full questions with answers, as the Dashboard has always displayed them
        "quiz": questions,
    }


@router.post("/fill-blanks")
def create_fill_blanks(request: FillBlanksRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc, context_text = _owned_document_context(request.document_id, user, db)

    items = generate_fill_blanks(context_text, count=request.num_questions)
    if not items:
        raise HTTPException(status_code=502, detail="Failed to generate fill-in-the-blank questions from this document")

    fill_blank_set = FillBlankSet(
        user_id=user.id,
        document_id=doc.id,
        title=_title_from_filename(doc.filename, "Fill-in-the-Blanks"),
    )
    fill_blank_set.questions = [
        FillBlankQuestion(
            sentence=item["sentence"],
            answer=item["answer"],
            accepted_answers=item["accepted_answers"],
            hint=item["hint"],
        )
        for item in items
    ]
    db.add(fill_blank_set)
    db.flush()
    log_activity(db, user.id, activity.FILL_BLANKS_GENERATED, fill_blank_set.id, {
        "document_id": doc.id,
        "number_of_questions": len(items),
    })
    db.commit()
    db.refresh(fill_blank_set)

    return {
        "fill_blank_set_id": fill_blank_set.id,
        "title": fill_blank_set.title,
        "number_of_questions": len(items),
    }
