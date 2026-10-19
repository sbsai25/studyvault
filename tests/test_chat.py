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

MOCK_CHUNK = {
    "id": "999999",
    "text": "Some retrieved study material.",
    "metadata": {"user_id": 0, "document_id": 999999, "chunk_index": 0},
}

# Helper for auth
def setup_test_users():
    db = next(get_db())
    # The returned users outlive this session; don't expire them on commit
    db.expire_on_commit = False
    
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
    mock_search.return_value = [MOCK_CHUNK]
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


# --- History, document scoping, sources ------------------------------------

from backend.models.document import Document
from backend.routers.chat import NO_CONTEXT_ANSWER
from backend.services.rag import AIServiceError


def _document_for(user, filename):
    db = next(get_db())
    db.expire_on_commit = False
    doc = db.query(Document).filter(Document.user_id == user.id, Document.filename == filename).first()
    if not doc:
        doc = Document(user_id=user.id, filename=filename, file_type="txt", upload_path="unused")
        db.add(doc)
        db.commit()
    return doc


def _chunk(doc, chunk_id, text, index=0):
    return {
        "id": str(chunk_id),
        "text": text,
        "metadata": {"user_id": doc.user_id, "document_id": doc.id, "chunk_index": index},
    }


def _conversation_count(user):
    db = next(get_db())
    return db.query(Conversation).filter(Conversation.user_id == user.id).count()


@patch("backend.routers.chat.generate_conversation_title", return_value="Title")
@patch("backend.routers.chat.generate_answer")
@patch("backend.routers.chat.search_chunks", return_value=[MOCK_CHUNK])
def test_history_reaches_generate_answer_in_order(mock_search, mock_answer, _title, auth_client_a):
    mock_answer.side_effect = ["Answer 1", "Answer 2", "Answer 3"]

    conv_id = auth_client_a.post("/chat/", json={"query": "Question 1"}).json()["conversation_id"]
    auth_client_a.post("/chat/", json={"query": "Question 2", "conversation_id": conv_id})
    auth_client_a.post("/chat/", json={"query": "What about that?", "conversation_id": conv_id})

    first_history = mock_answer.call_args_list[0].args[2]
    assert first_history == []  # new conversation has no history

    query, _, history = mock_answer.call_args_list[2].args
    assert query == "What about that?"
    assert history == [
        {"role": "user", "content": "Question 1"},
        {"role": "assistant", "content": "Answer 1"},
        {"role": "user", "content": "Question 2"},
        {"role": "assistant", "content": "Answer 2"},
    ]
    # The follow-up is searched together with the previous question
    assert mock_search.call_args.args[0] == "Question 2\nWhat about that?"


@patch("backend.routers.chat.generate_conversation_title", return_value="Title")
@patch("backend.routers.chat.generate_answer", return_value="Answer")
@patch("backend.routers.chat.search_chunks", return_value=[MOCK_CHUNK])
def test_history_is_limited_to_last_six_messages(_search, mock_answer, _title, auth_client_a):
    conv_id = auth_client_a.post("/chat/", json={"query": "Q1"}).json()["conversation_id"]
    for q in ("Q2", "Q3", "Q4", "Q5"):
        auth_client_a.post("/chat/", json={"query": q, "conversation_id": conv_id})

    history = mock_answer.call_args.args[2]
    assert len(history) == 6
    assert history[0] == {"role": "user", "content": "Q2"}
    assert history[-1] == {"role": "assistant", "content": "Answer"}


@patch("backend.routers.chat.generate_conversation_title", return_value="Title")
@patch("backend.routers.chat.generate_answer", return_value="Scoped answer")
@patch("backend.routers.chat.search_chunks", return_value=[MOCK_CHUNK])
def test_document_id_scopes_retrieval(mock_search, _answer, _title, auth_client_a):
    user_a, _ = setup_test_users()
    doc = _document_for(user_a, "scoped_notes.txt")

    res = auth_client_a.post("/chat/", json={"query": "Explain it", "document_id": doc.id})

    assert res.status_code == 200
    assert mock_search.call_args.kwargs["document_id"] == doc.id
    assert mock_search.call_args.kwargs["user_id"] == user_a.id

    # Scope is per request: a follow-up without document_id searches everything
    auth_client_a.post("/chat/", json={"query": "And more?", "conversation_id": res.json()["conversation_id"]})
    assert mock_search.call_args.kwargs["document_id"] is None


@patch("backend.routers.chat.generate_conversation_title", return_value="Title")
@patch("backend.routers.chat.generate_answer", return_value="Answer")
@patch("backend.routers.chat.search_chunks", return_value=[MOCK_CHUNK])
def test_other_users_document_returns_404_and_saves_nothing(mock_search, mock_answer, _title, auth_client_a):
    user_a, user_b = setup_test_users()
    doc_b = _document_for(user_b, "private_b.txt")
    before = _conversation_count(user_a)

    res = auth_client_a.post("/chat/", json={"query": "Peek", "document_id": doc_b.id})

    assert res.status_code == 404
    mock_search.assert_not_called()
    mock_answer.assert_not_called()
    assert _conversation_count(user_a) == before


@patch("backend.routers.chat.generate_conversation_title", return_value="Title")
@patch("backend.routers.chat.generate_answer", return_value="Answer")
@patch("backend.routers.chat.search_chunks", return_value=[MOCK_CHUNK])
def test_own_document_with_other_users_conversation_returns_404(mock_search, _answer, _title, auth_client_a, auth_client_b):
    user_a, _ = setup_test_users()
    doc_a = _document_for(user_a, "scoped_notes.txt")
    conv_b = auth_client_b.post("/chat/", json={"query": "B's chat"}).json()["conversation_id"]
    mock_search.reset_mock()

    app.dependency_overrides[get_current_user] = override_get_current_user_a
    res = client.post("/chat/", json={"query": "Hijack", "conversation_id": conv_b, "document_id": doc_a.id})

    assert res.status_code == 404
    mock_search.assert_not_called()


@patch("backend.routers.chat.generate_conversation_title", return_value="Title")
@patch("backend.routers.chat.generate_answer", return_value="Grounded answer")
@patch("backend.routers.chat.search_chunks")
def test_sources_include_filename_snippet_and_are_persisted(mock_search, _answer, _title, auth_client_a):
    user_a, _ = setup_test_users()
    doc = _document_for(user_a, "biology_notes.txt")
    long_text = "Mitochondria   produce ATP.\n" + "x" * 300
    chunk1 = _chunk(doc, 5001, long_text, index=3)
    chunk2 = _chunk(doc, 5002, "Ribosomes build proteins.", index=7)
    mock_search.return_value = [chunk1, chunk2, chunk1]  # duplicate is dropped

    res = auth_client_a.post("/chat/", json={"query": "What makes ATP?"})
    assert res.status_code == 200
    sources = res.json()["sources"]

    assert [s["chunk_id"] for s in sources] == ["5001", "5002"]
    first = sources[0]
    assert first["document_id"] == doc.id  # old keys kept for the Dashboard
    assert first["filename"] == "biology_notes.txt"
    assert first["chunk_index"] == 3
    assert first["snippet"].startswith("Mitochondria produce ATP.")  # whitespace collapsed
    assert len(first["snippet"]) <= 201 and first["snippet"].endswith("…")
    assert sources[1]["snippet"] == "Ribosomes build proteins."

    conv = auth_client_a.get(f"/chat/conversations/{res.json()['conversation_id']}").json()
    user_msg, assistant_msg = conv["messages"]
    assert user_msg["sources"] is None
    assert assistant_msg["sources"] == sources


@patch("backend.routers.chat.generate_conversation_title", return_value="Title")
@patch("backend.routers.chat.generate_answer")
@patch("backend.routers.chat.search_chunks", return_value=[])
def test_no_retrieved_chunks_skips_gemini(_search, mock_answer, _title, auth_client_a):
    res = auth_client_a.post("/chat/", json={"query": "Something not in my notes"})

    assert res.status_code == 200
    assert res.json()["answer"] == NO_CONTEXT_ANSWER
    assert res.json()["sources"] == []
    mock_answer.assert_not_called()


@patch("backend.routers.chat.generate_conversation_title", return_value="Title")
@patch("backend.routers.chat.generate_answer", side_effect=AIServiceError("provider down"))
@patch("backend.routers.chat.search_chunks", return_value=[MOCK_CHUNK])
def test_ai_failure_returns_502_and_saves_nothing(_search, _answer, _title, auth_client_a):
    user_a, _ = setup_test_users()
    before = _conversation_count(user_a)

    res = auth_client_a.post("/chat/", json={"query": "Hello?"})

    assert res.status_code == 502
    assert "provider" not in res.text
    assert _conversation_count(user_a) == before
