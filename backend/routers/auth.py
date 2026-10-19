import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from jwt import InvalidTokenError
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.deps import get_current_user
from backend.models.refresh_token import RefreshToken
from backend.models.user import User
from backend.rate_limit import auth_rate_limit, refresh_rate_limit
from backend.schemas.auth import RefreshRequest, TokenResponse
from backend.schemas.user import UserCreate, UserLogin, UserRead
from backend.security import (
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_tokens(user_id: int, db: Session) -> TokenResponse:
    """Creates an access/refresh pair and stores the refresh token's jti.

    The caller commits.
    """
    jti = uuid.uuid4().hex
    db.add(RefreshToken(
        user_id=user_id,
        jti=jti,
        expires_at=datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    ))
    return TokenResponse(
        access_token=create_access_token(data={"sub": str(user_id)}),
        refresh_token=create_refresh_token(data={"sub": str(user_id)}, jti=jti),
    )


def _refresh_claims(token: str) -> tuple[int, str] | None:
    """(user_id, jti) from a validly signed, unexpired refresh token, else None.

    Tokens issued before rotation existed have no jti and are rejected.
    """
    try:
        payload = decode_token(token)
        if payload.get("type") != "refresh" or not payload.get("jti"):
            return None
        return int(payload["sub"]), str(payload["jti"])
    except (InvalidTokenError, KeyError, TypeError, ValueError):
        return None


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(auth_rate_limit)],
)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    new_user = User(
        email=user_data.email,
        password_hash=hash_password(user_data.password),
    )
    db.add(new_user)
    db.flush()

    tokens = _issue_tokens(new_user.id, db)
    db.commit()
    return tokens


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(auth_rate_limit)])
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_data.email).first()

    if not user or not verify_password(user_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    tokens = _issue_tokens(user.id, db)
    db.commit()
    return tokens


@router.post("/refresh", response_model=TokenResponse, dependencies=[Depends(refresh_rate_limit)])
def refresh(request: RefreshRequest, db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    claims = _refresh_claims(request.refresh_token)
    if claims is None:
        # Forged, expired, malformed or legacy token: reject, never revoke anything
        raise credentials_exception
    user_id, jti = claims

    # Lock the row before checking it, so two concurrent refreshes with the
    # same token can't both succeed: the second waits, then sees it revoked.
    stored = (
        db.query(RefreshToken)
        .filter(RefreshToken.jti == jti)
        .with_for_update()
        .first()
    )
    if stored is None or stored.user_id != user_id:
        raise credentials_exception

    now = datetime.utcnow()
    if stored.revoked_at is not None:
        # A token we issued is being used again after rotation or logout:
        # treat it as stolen and log the user out everywhere.
        db.query(RefreshToken).filter(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
        ).update({RefreshToken.revoked_at: now}, synchronize_session=False)
        db.commit()
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        raise credentials_exception

    # Revoke the old token and store the new one in the same commit
    stored.revoked_at = now
    tokens = _issue_tokens(user.id, db)
    db.commit()
    return tokens


@router.post("/logout")
def logout(request: Optional[RefreshRequest] = None, db: Session = Depends(get_db)):
    # Revokes the given refresh token. Always succeeds, so logging out twice
    # or with an invalid/expired token is harmless. Access tokens stay valid
    # until they expire (at most ACCESS_TOKEN_EXPIRE_MINUTES).
    claims = _refresh_claims(request.refresh_token) if request else None
    if claims:
        user_id, jti = claims
        db.query(RefreshToken).filter(
            RefreshToken.jti == jti,
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
        ).update({RefreshToken.revoked_at: datetime.utcnow()}, synchronize_session=False)
        db.commit()
    return {"message": "Successfully logged out"}


@router.get("/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
