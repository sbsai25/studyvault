import uuid
import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_auth_full_flow():
    # Generate unique test email
    unique_id = uuid.uuid4().hex[:8]
    email = f"test_{unique_id}@example.com"
    password = "securePassword123!"

    # 1. Register new user
    reg_res = client.post(
        "/auth/register",
        json={"email": email, "password": password},
    )
    assert reg_res.status_code == 201
    tokens = reg_res.json()
    assert "access_token" in tokens
    assert "refresh_token" in tokens
    assert tokens["token_type"] == "bearer"
    access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]

    # 2. Duplicate registration should fail (409 Conflict)
    dup_res = client.post(
        "/auth/register",
        json={"email": email, "password": password},
    )
    assert dup_res.status_code == 409
    assert dup_res.json()["detail"] == "Email already registered"

    # 3. Login with wrong password should fail (401 Unauthorized)
    bad_login_res = client.post(
        "/auth/login",
        json={"email": email, "password": "wrongPassword"},
    )
    assert bad_login_res.status_code == 401

    # 4. Login with correct password
    login_res = client.post(
        "/auth/login",
        json={"email": email, "password": password},
    )
    assert login_res.status_code == 200
    login_tokens = login_res.json()
    assert "access_token" in login_tokens
    new_access_token = login_tokens["access_token"]
    new_refresh_token = login_tokens["refresh_token"]

    # 5. Access protected /auth/me without token -> 401
    unauth_me = client.get("/auth/me")
    assert unauth_me.status_code == 401

    # 6. Access protected /auth/me with valid Bearer token -> 200
    me_res = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {new_access_token}"},
    )
    assert me_res.status_code == 200
    user_data = me_res.json()
    assert user_data["email"] == email
    assert "id" in user_data
    assert "password_hash" not in user_data

    # 7. Refresh token flow
    refresh_res = client.post(
        f"/auth/refresh?refresh_token={new_refresh_token}"
    )
    assert refresh_res.status_code == 200
    refreshed_tokens = refresh_res.json()
    assert "access_token" in refreshed_tokens
    assert "refresh_token" in refreshed_tokens

    # 8. Logout endpoint
    logout_res = client.post("/auth/logout")
    assert logout_res.status_code == 200
