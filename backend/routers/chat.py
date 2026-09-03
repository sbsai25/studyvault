from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional, List

from backend.database import get_db
from backend.deps import get_current_user
from backend.models.user import User
from backend.models.conversation import Conversation, Message
from backend.services.rag import search_chunks, generate_answer, generate_conversation_title

router = APIRouter(prefix="/chat", tags=["chat"])

class ChatRequest(BaseModel):
    query: str
    conversation_id: Optional[int] = None

class RenameConversationRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)

@router.post("/")
def chat_query(
    request: ChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    is_new = False
    if request.conversation_id:
        conversation = db.query(Conversation).filter(
            Conversation.id == request.conversation_id, 
            Conversation.user_id == user.id
        ).first()
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        conversation.updated_at = datetime.utcnow()
    else:
        title = generate_conversation_title(request.query)
        conversation = Conversation(user_id=user.id, title=title)
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
        is_new = True

    user_msg = Message(conversation_id=conversation.id, role="user", content=request.query)
    db.add(user_msg)
    
    chunks = search_chunks(request.query, user_id=user.id, top_k=4)
    answer = generate_answer(request.query, chunks)
    
    asst_msg = Message(conversation_id=conversation.id, role="assistant", content=answer)
    db.add(asst_msg)
    
    # Commit messages and updated_at
    db.commit()
    db.refresh(conversation)
    
    return {
        "answer": answer,
        "conversation_id": conversation.id,
        "title": conversation.title if is_new else None,
        "sources": [
            {"document_id": c["metadata"].get("document_id"), "chunk_id": c["id"]}
            for c in chunks
        ]
    }

@router.get("/conversations")
def list_conversations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    convs = db.query(Conversation).filter(
        Conversation.user_id == user.id
    ).order_by(Conversation.updated_at.desc()).all()
    
    return [
        {
            "id": c.id, 
            "title": c.title, 
            "created_at": c.created_at,
            "updated_at": c.updated_at
        } for c in convs
    ]

@router.get("/conversations/{conversation_id}")
def get_conversation_messages(conversation_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id, 
        Conversation.user_id == user.id
    ).first()
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    messages = db.query(Message).filter(
        Message.conversation_id == conversation_id
    ).order_by(Message.created_at.asc()).all()
    
    return {
        "id": conversation.id,
        "title": conversation.title,
        "created_at": conversation.created_at,
        "updated_at": conversation.updated_at,
        "messages": [
            {
                "id": m.id, 
                "role": m.role, 
                "content": m.content, 
                "created_at": m.created_at
            } for m in messages
        ]
    }

@router.patch("/conversations/{conversation_id}")
def rename_conversation(
    conversation_id: int, 
    request: RenameConversationRequest, 
    user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id, 
        Conversation.user_id == user.id
    ).first()
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    title = request.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Title cannot be empty")
        
    conversation.title = title
    conversation.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(conversation)
    
    return {
        "id": conversation.id,
        "title": conversation.title,
        "updated_at": conversation.updated_at
    }

@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int, 
    user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id, 
        Conversation.user_id == user.id
    ).first()
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    db.delete(conversation)
    db.commit()
    
    return {"message": "Conversation deleted successfully"}
