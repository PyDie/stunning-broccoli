from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app import crud, schemas
from app.auth import verify_session_token
from app.database import get_db


def _ensure_token(auth_header: str | None) -> str:
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    return auth_header.split(" ", 1)[1]


def get_current_user(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None, convert_underscores=False, alias="Authorization"),
    x_debug_user_id: int | None = Header(default=None),
) -> schemas.UserRead:
    # Dev fallback with mocked user header
    if x_debug_user_id:
        payload = schemas.UserCreate(id=x_debug_user_id, first_name="Debug", last_name=None, username="debug")
        return crud.create_or_update_user(db, payload)

    token = _ensure_token(authorization)
    try:
        tg_user = verify_session_token(token)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session") from exc

    payload = schemas.UserCreate(
        id=tg_user.get("id"),
        first_name=tg_user.get("first_name"),
        last_name=tg_user.get("last_name"),
        username=tg_user.get("username"),
    )
    return crud.create_or_update_user(db, payload)
