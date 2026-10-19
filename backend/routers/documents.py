import os
import re
import uuid
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter

from backend.database import get_db
from backend.deps import get_current_user
from backend.models.user import User
from backend.models.document import Document
from backend.models.chunk import Chunk
from backend.services.rag import add_chunks_to_vector_store, delete_document_chunks_from_vector_store

router = APIRouter(prefix="/documents", tags=["documents"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Keep only the base name of the client-supplied filename (strip any path parts)
    original_name = os.path.basename((file.filename or "").replace("\\", "/")) or "upload"
    file_ext = os.path.splitext(original_name)[1].lower()
    if not re.fullmatch(r"\.[a-z0-9]{1,10}", file_ext):
        file_ext = ""
    file_type = file_ext[1:] if file_ext else "unknown"

    # Save under a unique generated name so uploads can't escape UPLOAD_DIR
    # or overwrite another user's file with the same name
    file_path = os.path.join(UPLOAD_DIR, f"{uuid.uuid4().hex}{file_ext}")
    with open(file_path, "wb") as f:
        f.write(await file.read())

    # Create document record
    db_doc = Document(
        user_id=user.id,
        filename=original_name,
        file_type=file_type,
        upload_path=file_path
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    
    # Extract text
    text = ""
    if file_type == "pdf":
        reader = PdfReader(file_path)
        for page in reader.pages:
            text += page.extract_text() + "\n"
    elif file_type == "txt":
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read()
    elif file_type == "docx":
        import docx
        doc = docx.Document(file_path)
        text = "\n".join([para.text for para in doc.paragraphs])
    elif file_type == "pptx":
        import pptx
        presentation = pptx.Presentation(file_path)
        for slide in presentation.slides:
            for shape in slide.shapes:
                if hasattr(shape, "text"):
                    text += shape.text + "\n"
    else:
        # Ignore other types for now, or just try to read as text
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                text = f.read()
        except:
            raise HTTPException(status_code=400, detail="Unsupported file format")
            
    # Chunk text
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
    )
    texts = text_splitter.split_text(text)
    
    if not texts:
        return {"message": "Document uploaded but no text extracted", "document_id": db_doc.id}
    
    # Save chunks to DB
    db_chunks = []
    for idx, chunk_text in enumerate(texts):
        c = Chunk(
            document_id=db_doc.id,
            user_id=user.id,
            content=chunk_text,
            chunk_index=idx
        )
        db_chunks.append(c)
        
    db.add_all(db_chunks)
    db.commit()
    
    # Generate embeddings and add to vector store
    # We need to refresh db_chunks to get their IDs
    for c in db_chunks:
        db.refresh(c)
        
    vector_chunks = []
    for c in db_chunks:
        vector_chunks.append({
            "id": str(c.id),
            "text": c.content,
            "metadata": {
                "user_id": user.id,
                "document_id": db_doc.id,
                "chunk_index": c.chunk_index
            }
        })
        
    add_chunks_to_vector_store(vector_chunks)
    
    return {"message": "Document uploaded and processed successfully", "document_id": db_doc.id, "chunks_count": len(vector_chunks)}

@router.get("/")
def get_documents(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    docs = db.query(Document).filter(Document.user_id == user.id).all()
    return [{"id": d.id, "filename": d.filename, "created_at": d.created_at} for d in docs]

@router.delete("/{document_id}")
def delete_document(document_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == document_id, Document.user_id == user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Delete from ChromaDB
    delete_document_chunks_from_vector_store(document_id)
    
    # Remove file from disk
    if os.path.exists(doc.upload_path):
        os.remove(doc.upload_path)
        
    # Delete from SQLite database (cascade will handle chunks)
    db.delete(doc)
    db.commit()
    
    return {"message": "Document deleted successfully"}

