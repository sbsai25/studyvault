from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.database import get_db
from backend.deps import get_current_user
from backend.models.user import User
from backend.models.document import Document
from backend.models.chunk import Chunk
from backend.services.rag import generate_flashcards, generate_quiz

router = APIRouter(prefix="/tools", tags=["tools"])

class ToolRequest(BaseModel):
    document_id: int

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
    
    flashcards = generate_flashcards(context_text)
    return {"flashcards": flashcards}

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
