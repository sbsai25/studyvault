import uuid
import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_health_check_reports_database_outage():
    from unittest.mock import patch

    import backend.database

    with patch.object(backend.database.engine, "connect", side_effect=OSError("db down")):
        response = client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"status": "unhealthy"}


@pytest.mark.parametrize("url, expected", [
    ("postgres://u:p@h:5432/db", "postgresql+psycopg://u:p@h:5432/db"),
    ("postgresql://u:p@h:5432/db", "postgresql+psycopg://u:p@h:5432/db"),
    ("postgresql+psycopg://u:p@h:5432/db", "postgresql+psycopg://u:p@h:5432/db"),
])
def test_normalize_database_url(url, expected):
    from backend.database import normalize_database_url

    assert normalize_database_url(url) == expected


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
        "/auth/refresh", json={"refresh_token": new_refresh_token}
    )
    assert refresh_res.status_code == 200
    refreshed_tokens = refresh_res.json()
    assert "access_token" in refreshed_tokens
    assert "refresh_token" in refreshed_tokens

    # 8. Logout endpoint
    logout_res = client.post("/auth/logout")
    assert logout_res.status_code == 200


# --- Refresh-token rotation and revocation ---------------------------------

import threading
from datetime import datetime, timedelta, timezone

import jwt

from backend.database import SessionLocal
from backend.models.refresh_token import RefreshToken
from backend.security import ALGORITHM, SECRET_KEY, create_refresh_token, decode_token


def new_user_tokens():
    email = f"rotate_{uuid.uuid4().hex[:10]}@example.com"
    res = client.post("/auth/register", json={"email": email, "password": "securePassword123!"})
    assert res.status_code == 201
    tokens = res.json()
    user_id = int(decode_token(tokens["access_token"])["sub"])
    return user_id, tokens


def refresh(token):
    return client.post("/auth/refresh", json={"refresh_token": token})


def token_rows(user_id):
    """{jti: revoked?} for every refresh token stored for the user."""
    db = SessionLocal()
    try:
        rows = db.query(RefreshToken).filter(RefreshToken.user_id == user_id).all()
        return {r.jti: r.revoked_at is not None for r in rows}
    finally:
        db.close()


def jti_of(token):
    return decode_token(token)["jti"]


def test_register_and_login_store_refresh_tokens():
    user_id, tokens = new_user_tokens()
    assert token_rows(user_id) == {jti_of(tokens["refresh_token"]): False}


def test_refresh_rotates_token():
    user_id, tokens = new_user_tokens()
    old = tokens["refresh_token"]

    res = refresh(old)

    assert res.status_code == 200
    new = res.json()["refresh_token"]
    assert new != old
    assert token_rows(user_id) == {jti_of(old): True, jti_of(new): False}
    # The new token works
    assert refresh(new).status_code == 200


def test_reusing_rotated_token_revokes_all_sessions():
    user_id, tokens = new_user_tokens()
    old = tokens["refresh_token"]
    new = refresh(old).json()["refresh_token"]
    # A second, independent login on another device
    other_device = refresh(new).json()["refresh_token"]

    res = refresh(old)  # replay of an already-rotated token

    assert res.status_code == 401
    assert all(token_rows(user_id).values())  # every token for the user revoked
    assert refresh(other_device).status_code == 401


def test_forged_and_unknown_tokens_do_not_revoke_anything():
    user_id, tokens = new_user_tokens()
    good = tokens["refresh_token"]
    expiry = datetime.now(timezone.utc) + timedelta(days=1)

    forged = jwt.encode(
        {"sub": str(user_id), "type": "refresh", "jti": jti_of(good), "exp": expiry},
        "not-the-real-secret", algorithm=ALGORITHM,
    )
    unknown_jti = create_refresh_token({"sub": str(user_id)}, jti="never-issued")
    wrong_user = jwt.encode(
        {"sub": str(user_id + 100000), "type": "refresh", "jti": jti_of(good), "exp": expiry},
        SECRET_KEY, algorithm=ALGORITHM,
    )

    for token in (forged, unknown_jti, wrong_user, "garbage"):
        assert refresh(token).status_code == 401

    assert token_rows(user_id) == {jti_of(good): False}
    assert refresh(good).status_code == 200


def test_legacy_and_wrong_type_tokens_are_rejected():
    user_id, tokens = new_user_tokens()
    expiry = datetime.now(timezone.utc) + timedelta(days=1)
    legacy = jwt.encode({"sub": str(user_id), "type": "refresh", "exp": expiry}, SECRET_KEY, algorithm=ALGORITHM)
    expired = jwt.encode(
        {"sub": str(user_id), "type": "refresh", "jti": jti_of(tokens["refresh_token"]),
         "exp": datetime.now(timezone.utc) - timedelta(seconds=1)},
        SECRET_KEY, algorithm=ALGORITHM,
    )

    assert refresh(legacy).status_code == 401
    assert refresh(expired).status_code == 401
    assert refresh(tokens["access_token"]).status_code == 401
    assert token_rows(user_id) == {jti_of(tokens["refresh_token"]): False}


def test_refresh_token_no_longer_accepted_in_query_string():
    _, tokens = new_user_tokens()
    res = client.post(f"/auth/refresh?refresh_token={tokens['refresh_token']}")
    assert res.status_code == 422


def test_logout_revokes_token_and_is_idempotent():
    user_id, tokens = new_user_tokens()
    token = tokens["refresh_token"]

    assert client.post("/auth/logout", json={"refresh_token": token}).status_code == 200
    assert token_rows(user_id) == {jti_of(token): True}
    assert refresh(token).status_code == 401

    # Logging out again, with garbage, or with no body still succeeds
    assert client.post("/auth/logout", json={"refresh_token": token}).status_code == 200
    assert client.post("/auth/logout", json={"refresh_token": "garbage"}).status_code == 200
    assert client.post("/auth/logout").status_code == 200


def test_logout_does_not_revoke_other_sessions():
    user_id, tokens = new_user_tokens()
    second = client.post("/auth/login", json={
        "email": client.get("/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}).json()["email"],
        "password": "securePassword123!",
    }).json()["refresh_token"]

    client.post("/auth/logout", json={"refresh_token": tokens["refresh_token"]})

    assert token_rows(user_id)[jti_of(second)] is False
    assert refresh(second).status_code == 200


def test_concurrent_refreshes_cannot_both_succeed():
    import time
    from unittest.mock import patch
    from backend.routers import auth as auth_router

    user_id, tokens = new_user_tokens()
    token = tokens["refresh_token"]
    barrier = threading.Barrier(2)
    statuses = []
    original_issue = auth_router._issue_tokens

    def slow_issue(*args, **kwargs):
        # Widen the window between reading the token row and committing, so
        # both requests are inside it at once unless the row lock serialises them
        time.sleep(0.5)
        return original_issue(*args, **kwargs)

    def worker():
        own_client = TestClient(app)
        barrier.wait()
        statuses.append(own_client.post("/auth/refresh", json={"refresh_token": token}).status_code)

    with patch.object(auth_router, "_issue_tokens", side_effect=slow_issue):
        threads = [threading.Thread(target=worker) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)

    assert sorted(statuses) == [200, 401]
    # The losing request looks like reuse, so every session is revoked
    assert all(token_rows(user_id).values())


# --- Rate limiting -----------------------------------------------------------

def test_login_is_rate_limited():
    email = f"ratelimit_{uuid.uuid4().hex[:8]}@example.com"
    for _ in range(5):
        res = client.post("/auth/login", json={"email": email, "password": "wrong"})
        assert res.status_code == 401

    res = client.post("/auth/login", json={"email": email, "password": "wrong"})
    assert res.status_code == 429
    assert int(res.headers["Retry-After"]) >= 1

    # Other routes have their own window
    assert client.post("/auth/register", json={
        "email": email, "password": "securePassword123!",
    }).status_code == 201


def test_refresh_is_rate_limited():
    for _ in range(20):
        assert refresh("garbage").status_code == 401
    assert refresh("garbage").status_code == 429
