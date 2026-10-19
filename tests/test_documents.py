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

@patch("backend.services.rag.get_embedding")
def test_upload_and_delete_document(mock_get_embedding, tmp_path):
    # Mock the embedding generation to return a dummy vector matching gemini-embedding-2 dimensions
    mock_get_embedding.return_value = [0.1] * 3072
    
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


@patch("backend.services.rag.get_embedding")
def test_upload_filename_cannot_escape_upload_dir(mock_get_embedding):
    mock_get_embedding.return_value = [0.1] * 3072

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
