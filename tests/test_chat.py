import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import get_db, Base, engine
from backend.models.user import User
from backend.models.conversation import Conversation, Message
from backend.deps import get_current_user
import time

client = TestClient(app)

# Helper for auth
def setup_test_users():
    db = next(get_db())
    
    # User A
    user_a = db.query(User).filter(User.email == "test_a_chat@example.com").first()
    if not user_a:
        user_a = User(email="test_a_chat@example.com", password_hash="hash")
        db.add(user_a)
        db.commit()
        db.refresh(user_a)
        
    # User B
    user_b = db.query(User).filter(User.email == "test_b_chat@example.com").first()
    if not user_b:
        user_b = User(email="test_b_chat@example.com", password_hash="hash")
        db.add(user_b)
        db.commit()
        db.refresh(user_b)
        
    return user_a, user_b

# Override dependency to mock authentication
def override_get_current_user_a():
    user_a, _ = setup_test_users()
    return user_a

def override_get_current_user_b():
    _, user_b = setup_test_users()
    return user_b

@pytest.fixture
def auth_client_a():
    app.dependency_overrides[get_current_user] = override_get_current_user_a
    yield client
    app.dependency_overrides.clear()

@pytest.fixture
def auth_client_b():
    app.dependency_overrides[get_current_user] = override_get_current_user_b
    yield client
    app.dependency_overrides.clear()

@patch("backend.routers.chat.search_chunks")
@patch("backend.routers.chat.generate_answer")
@patch("backend.routers.chat.generate_conversation_title")
def test_create_conversation_and_title(mock_title, mock_answer, mock_search, auth_client_a):
    mock_search.return_value = []
    mock_answer.return_value = "This is a mock answer."
    mock_title.return_value = "Mock Title"

    response = auth_client_a.post("/chat/", json={"query": "Hello world"})
    assert response.status_code == 200
    data = response.json()
    
    assert data["answer"] == "This is a mock answer."
    assert data["title"] == "Mock Title"
    assert "conversation_id" in data
    
    conv_id = data["conversation_id"]
    
    # Check DB
    db = next(get_db())
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    assert conv is not None
    assert conv.title == "Mock Title"
    
    messages = db.query(Message).filter(Message.conversation_id == conv_id).all()
    assert len(messages) == 2
    assert messages[0].role == "user"
    assert messages[1].role == "assistant"

@patch("backend.routers.chat.search_chunks")
@patch("backend.routers.chat.generate_answer")
@patch("backend.routers.chat.generate_conversation_title")
def test_continue_conversation(mock_title, mock_answer, mock_search, auth_client_a):
    mock_search.return_value = []
    mock_answer.return_value = "Answer 1"
    mock_title.return_value = "Title 1"

    # Create conv
    res1 = auth_client_a.post("/chat/", json={"query": "Msg 1"})
    conv_id = res1.json()["conversation_id"]
    
    time.sleep(0.1) # For updated_at checking later
    
    mock_answer.return_value = "Answer 2"
    # Continue conv
    res2 = auth_client_a.post("/chat/", json={"query": "Msg 2", "conversation_id": conv_id})
    assert res2.status_code == 200
    
    db = next(get_db())
    messages = db.query(Message).filter(Message.conversation_id == conv_id).all()
    assert len(messages) == 4

@patch("backend.routers.chat.search_chunks")
@patch("backend.routers.chat.generate_answer")
def test_title_fallback(mock_answer, mock_search, auth_client_a):
    mock_search.return_value = []
    mock_answer.return_value = "Answer"
    # Don't mock generate_conversation_title, but mock the Gemini client inside it
    # Instead, we can just mock generate_conversation_title to return the fallback behavior
    # Actually, we can patch `backend.services.rag.client.models.generate_content` directly.
    pass

@patch("backend.services.rag.client.models.generate_content")
@patch("backend.routers.chat.search_chunks")
@patch("backend.routers.chat.generate_answer")
def test_title_fallback_internal(mock_answer, mock_search, mock_gen, auth_client_a):
    mock_search.return_value = []
    mock_answer.return_value = "Answer"
    
    # Simulate API failure for title generation
    mock_gen.side_effect = Exception("API Error")

    long_query = "This is a very long query that exceeds fifty characters to test the fallback mechanism completely."
    res = auth_client_a.post("/chat/", json={"query": long_query})
    
    assert res.status_code == 200
    data = res.json()
    assert data["title"] == long_query[:50]

def test_get_conversations_and_ownership(auth_client_a, auth_client_b):
    # Get user A conversations
    res_a = auth_client_a.get("/chat/conversations")
    assert res_a.status_code == 200
    
    # User B should not see User A's conversations
    res_b = auth_client_b.get("/chat/conversations")
    assert res_b.status_code == 200
    
    if len(res_a.json()) > 0:
        # Check B can't access A's specific conversation
        conv_id = res_a.json()[0]["id"]
        res_b_single = auth_client_b.get(f"/chat/conversations/{conv_id}")
        assert res_b_single.status_code == 404
        
        # B can't continue A's chat
        res_b_cont = auth_client_b.post("/chat/", json={"query": "msg", "conversation_id": conv_id})
        assert res_b_cont.status_code == 404
        
        # B can't rename A's chat
        res_b_rename = auth_client_b.patch(f"/chat/conversations/{conv_id}", json={"title": "Hack"})
        assert res_b_rename.status_code == 404
        
        # B can't delete A's chat
        res_b_delete = auth_client_b.delete(f"/chat/conversations/{conv_id}")
        assert res_b_delete.status_code == 404

def test_rename_conversation(auth_client_a):
    # Need at least one conv
    res = auth_client_a.get("/chat/conversations")
    if not res.json():
        return
    conv_id = res.json()[0]["id"]
    
    # Rename valid
    res_rename = auth_client_a.patch(f"/chat/conversations/{conv_id}", json={"title": "New Title"})
    assert res_rename.status_code == 200
    assert res_rename.json()["title"] == "New Title"
    
    # Empty title
    res_empty = auth_client_a.patch(f"/chat/conversations/{conv_id}", json={"title": "   "})
    assert res_empty.status_code == 422

def test_delete_conversation(auth_client_a):
    res = auth_client_a.get("/chat/conversations")
    if not res.json():
        return
    conv_id = res.json()[0]["id"]
    
    res_del = auth_client_a.delete(f"/chat/conversations/{conv_id}")
    assert res_del.status_code == 200
    
    # Check messages deleted
    db = next(get_db())
    messages = db.query(Message).filter(Message.conversation_id == conv_id).all()
    assert len(messages) == 0
