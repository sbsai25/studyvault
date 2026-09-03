import os
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.database import get_db
from backend.deps import get_current_user
from backend.models.user import User
from backend.models.document import Document
from backend.models.chunk import Chunk
from backend.models.flashcard import FlashcardSet, Flashcard
from backend.services.rag import generate_flashcards, generate_quiz

router = APIRouter(prefix="/tools", tags=["tools"])

class ToolRequest(BaseModel):
    document_id: int


def _title_from_filename(filename: str) -> str:
    name = os.path.splitext(filename)[0]
    name = re.sub(r"[_\-]+", " ", name).strip()
    return f"{name.title()} Flashcards" if name else "Flashcards"


@router.post("/flashcards")
def create_flashcards(request: ToolRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == request.document_id, Document.user_id == user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    chunks = db.query(Chunk).filter(Chunk.document_id == doc.id).all()
    if not chunks:
        raise HTTPException(status_code=400, detail="Document has no content")

    # Combine some chunks to give context to Gemini, or just use the first few to avoid token limits
    context_text = "\n\n".join([c.content for c in chunks[:10]]) # using first 10 chunks for simplicity

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
    db.commit()

    return {
        "flashcard_set_id": flashcard_set.id,
        "title": flashcard_set.title,
        "number_of_cards": len(cards),
    }

@router.post("/quiz")
def create_quiz(request: ToolRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == request.document_id, Document.user_id == user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    chunks = db.query(Chunk).filter(Chunk.document_id == doc.id).all()
    if not chunks:
        raise HTTPException(status_code=400, detail="Document has no content")
        
    context_text = "\n\n".join([c.content for c in chunks[:10]])
    
    quiz = generate_quiz(context_text)
    return {"quiz": quiz}
