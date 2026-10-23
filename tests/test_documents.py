import uuid
import os
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def setup_test_user():
    unique_id = uuid.uuid4().hex[:8]
    email = f"test_doc_{unique_id}@example.com"
    password = "password"
    client.post("/auth/register", json={"email": email, "password": password})
    res = client.post("/auth/login", json={"email": email, "password": password})
    return res.json()["access_token"]

@patch("backend.services.rag.get_embeddings")
def test_upload_and_delete_document(mock_get_embeddings, tmp_path):
    # Mock the embedding generation to return dummy vectors matching EMBEDDING_DIMENSIONS
    mock_get_embeddings.side_effect = lambda texts: [[0.1] * 768 for _ in texts]
    
    token = setup_test_user()
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create a dummy text file
    test_file_path = tmp_path / "test.txt"
    test_file_path.write_text("This is a test document about artificial intelligence.")
    
    with open(test_file_path, "rb") as f:
        upload_res = client.post(
            "/documents/upload",
            files={"file": ("test.txt", f, "text/plain")},
            headers=headers
        )
        
    assert upload_res.status_code == 200
    data = upload_res.json()
    assert "document_id" in data
    doc_id = data["document_id"]
    
    # Check if document is listed
    list_res = client.get("/documents/", headers=headers)
    assert list_res.status_code == 200
    docs = list_res.json()
    assert len(docs) == 1
    assert docs[0]["id"] == doc_id
    assert docs[0]["filename"] == "test.txt"
    
    # Delete the document
    delete_res = client.delete(f"/documents/{doc_id}", headers=headers)
    assert delete_res.status_code == 200
    
    # Verify deletion
    list_res2 = client.get("/documents/", headers=headers)
    assert len(list_res2.json()) == 0


@patch("backend.services.rag.get_embeddings")
def test_upload_filename_cannot_escape_upload_dir(mock_get_embeddings):
    mock_get_embeddings.side_effect = lambda texts: [[0.1] * 768 for _ in texts]

    token = setup_test_user()
    headers = {"Authorization": f"Bearer {token}"}

    upload_res = client.post(
        "/documents/upload",
        files={"file": ("../../evil.txt", b"Path traversal test content.", "text/plain")},
        headers=headers,
    )
    assert upload_res.status_code == 200
    doc_id = upload_res.json()["document_id"]

    # Only the base name is kept for display
    docs = client.get("/documents/", headers=headers).json()
    assert docs[0]["filename"] == "evil.txt"

    # The file is stored inside the uploads directory under a generated name
    from backend.database import SessionLocal
    from backend.models.document import Document
    from backend.routers.documents import UPLOAD_DIR

    db = SessionLocal()
    try:
        stored_path = db.get(Document, doc_id).upload_path
    finally:
        db.close()
    assert os.path.dirname(os.path.abspath(stored_path)) == os.path.abspath(UPLOAD_DIR)
    assert os.path.basename(stored_path) != "evil.txt"

    client.delete(f"/documents/{doc_id}", headers=headers)


# --- Upload validation and failure cleanup ---------------------------------

from backend.database import SessionLocal
from backend.models.chunk import Chunk
from backend.models.document import Document
from backend.routers.documents import UPLOAD_DIR
from backend.services.rag import AIServiceError

GENERIC_AI_ERROR = "The AI service failed to process this request. Please try again."


def _auth():
    token = setup_test_user()
    headers = {"Authorization": f"Bearer {token}"}
    user_id = client.get("/auth/me", headers=headers).json()["id"]
    return headers, user_id


def _upload(headers, name, content, content_type="text/plain"):
    return client.post(
        "/documents/upload",
        files={"file": (name, content, content_type)},
        headers=headers,
    )


def _uploaded_files():
    return set(os.listdir(UPLOAD_DIR))


def _rows_for(user_id):
    db = SessionLocal()
    try:
        docs = db.query(Document).filter(Document.user_id == user_id).count()
        chunks = db.query(Chunk).filter(Chunk.user_id == user_id).count()
        return docs, chunks
    finally:
        db.close()


def test_upload_rejects_unsupported_type():
    headers, user_id = _auth()
    before = _uploaded_files()

    res = _upload(headers, "malware.exe", b"MZ...", "application/octet-stream")

    assert res.status_code == 415
    assert _uploaded_files() == before
    assert _rows_for(user_id) == (0, 0)


def test_upload_rejects_file_over_size_limit():
    headers, user_id = _auth()
    before = _uploaded_files()

    # 1 MB limit; send 1.5 MB so the limit is crossed partway through a read
    with patch("backend.routers.documents.MAX_UPLOAD_MB", 1):
        res = _upload(headers, "big.txt", b"a" * (1024 * 1024 + 512 * 1024))

    assert res.status_code == 413
    assert _uploaded_files() == before  # no partial file left behind
    assert _rows_for(user_id) == (0, 0)


def test_upload_with_no_text_is_rejected_and_cleaned_up():
    headers, user_id = _auth()
    before = _uploaded_files()

    res = _upload(headers, "blank.txt", b"   \n\n  ")

    assert res.status_code == 422
    assert _uploaded_files() == before
    assert _rows_for(user_id) == (0, 0)


def test_upload_corrupt_pdf_is_rejected_and_cleaned_up():
    headers, user_id = _auth()
    before = _uploaded_files()

    res = _upload(headers, "broken.pdf", b"this is not a pdf", "application/pdf")

    assert res.status_code == 422
    assert _uploaded_files() == before
    assert _rows_for(user_id) == (0, 0)


@patch("backend.services.rag.get_embeddings")
def test_upload_embedding_failure_returns_502_and_cleans_up(mock_get_embeddings):
    mock_get_embeddings.side_effect = AIServiceError("quota exceeded for key AIza-secret")
    headers, user_id = _auth()
    before = _uploaded_files()

    res = _upload(headers, "notes.txt", b"Photosynthesis converts light into chemical energy.")

    assert res.status_code == 502
    assert res.json()["detail"] == GENERIC_AI_ERROR  # provider text never reaches the client
    assert _uploaded_files() == before
    assert _rows_for(user_id) == (0, 0)


@patch("backend.routers.documents.embed_chunks")
def test_upload_unexpected_error_still_cleans_up(mock_embed):
    mock_embed.side_effect = RuntimeError("vector store exploded")
    headers, user_id = _auth()
    before = _uploaded_files()

    res = _upload(headers, "notes.md", b"# Cells\nThe mitochondria is the powerhouse of the cell.")

    assert res.status_code == 500
    assert "exploded" not in res.json()["detail"]
    assert _uploaded_files() == before
    assert _rows_for(user_id) == (0, 0)


@patch("backend.services.rag.get_embeddings")
def test_document_list_includes_type_and_chunk_count(mock_get_embeddings):
    mock_get_embeddings.side_effect = lambda texts: [[0.1] * 768 for _ in texts]
    headers, _ = _auth()

    first = _upload(headers, "first.txt", b"Short note one.").json()["document_id"]
    second = _upload(headers, "second.md", ("word " * 400).encode()).json()["document_id"]

    docs = client.get("/documents/", headers=headers).json()
    assert [d["id"] for d in docs] == [second, first]  # newest first
    by_id = {d["id"]: d for d in docs}
    assert by_id[first]["file_type"] == "txt"
    assert by_id[first]["chunk_count"] == 1
    assert by_id[second]["file_type"] == "md"
    assert by_id[second]["chunk_count"] >= 2

    for doc_id in (first, second):
        client.delete(f"/documents/{doc_id}", headers=headers)
