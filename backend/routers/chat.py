from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional, List

from backend.database import get_db
from backend.deps import get_current_user
from backend.models.user import User
from backend.models.document import Document
from backend.models.conversation import Conversation, Message
from backend.services.rag import search_chunks, generate_answer, generate_conversation_title

router = APIRouter(prefix="/chat", tags=["chat"])

HISTORY_MESSAGES = 6
SNIPPET_CHARS = 200
NO_CONTEXT_ANSWER = "I couldn't find the answer in your uploaded materials."

class ChatRequest(BaseModel):
    query: str
    conversation_id: Optional[int] = None
    # Restrict retrieval to one of the user's documents for this request only
    document_id: Optional[int] = None

class RenameConversationRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)


def _snippet(text: str) -> str:
    text = " ".join(text.split())
    return text if len(text) <= SNIPPET_CHARS else text[:SNIPPET_CHARS].rstrip() + "…"


def _build_sources(chunks: List[dict], user: User, db: Session) -> List[dict]:
    doc_ids = {c["metadata"].get("document_id") for c in chunks}
    filenames = dict(
        db.query(Document.id, Document.filename)
        .filter(Document.id.in_(doc_ids), Document.user_id == user.id)
        .all()
    ) if doc_ids else {}

    sources = []
    seen = set()
    for c in chunks:
        if c["id"] in seen:
            continue
        seen.add(c["id"])
        doc_id = c["metadata"].get("document_id")
        sources.append({
            "document_id": doc_id,
            "chunk_id": c["id"],
            "filename": filenames.get(doc_id),
            "chunk_index": c["metadata"].get("chunk_index"),
            "snippet": _snippet(c["text"]),
        })
    return sources


@router.post("/")
def chat_query(
    request: ChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check ownership of everything referenced before retrieving or writing anything
    conversation = None
    if request.conversation_id:
        conversation = db.query(Conversation).filter(
            Conversation.id == request.conversation_id,
            Conversation.user_id == user.id
        ).first()
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")

    if request.document_id is not None:
        doc = db.query(Document).filter(
            Document.id == request.document_id, Document.user_id == user.id
        ).first()
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

    history = []
    if conversation:
        recent = (
            db.query(Message)
            .filter(Message.conversation_id == conversation.id)
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(HISTORY_MESSAGES)
            .all()
        )
        history = [{"role": m.role, "content": m.content} for m in reversed(recent)]

    # Include the previous question in the search so follow-ups like
    # "explain the second one" still retrieve the right passages
    last_user_question = next((m["content"] for m in reversed(history) if m["role"] == "user"), None)
    retrieval_query = f"{last_user_question}\n{request.query}" if last_user_question else request.query

    chunks = search_chunks(retrieval_query, user_id=user.id, top_k=4, document_id=request.document_id)
    if chunks:
        answer = generate_answer(request.query, chunks, history)
    else:
        # Nothing relevant was retrieved, so there is nothing to ground an answer in
        answer = NO_CONTEXT_ANSWER
    sources = _build_sources(chunks, user, db)

    is_new = conversation is None
    if is_new:
        title = generate_conversation_title(request.query)
        conversation = Conversation(user_id=user.id, title=title[:255])
        db.add(conversation)
        db.flush()
    else:
        conversation.updated_at = datetime.utcnow()

    db.add(Message(conversation_id=conversation.id, role="user", content=request.query))
    db.add(Message(conversation_id=conversation.id, role="assistant", content=answer, sources=sources))

    # Commit conversation, messages and updated_at together
    db.commit()
    db.refresh(conversation)

    return {
        "answer": answer,
        "conversation_id": conversation.id,
        "title": conversation.title if is_new else None,
        "sources": sources,
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
    ).order_by(Message.created_at.asc(), Message.id.asc()).all()
    
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
                "sources": m.sources,
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
