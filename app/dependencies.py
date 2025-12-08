from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession # <-- Используем АСИНХРОННУЮ сессию

from app import crud, schemas
from app.auth import verify_session_token
from app.database import get_async_db # <-- Используем АСИНХРОННЫЙ генератор зависимостей


def _ensure_token(auth_header: str | None) -> str:
    """Извлекает Bearer токен из заголовка Authorization."""
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid token format")
    return auth_header.split(" ", 1)[1].strip()


async def get_current_user(
    db: AsyncSession = Depends(get_async_db),
    authorization: str | None = Header(default=None, convert_underscores=False, alias="Authorization"),
    x_debug_user_id: int | None = Header(default=None),
) -> schemas.UserRead:
    
    # Debug режим только в development
    from app.config import get_settings
    settings = get_settings()
    
    if x_debug_user_id and settings.environment == "development":
        payload = schemas.UserCreate(id=x_debug_user_id, first_name="Debug", last_name=None, username="debug")
        user = await crud.create_or_update_user(db, payload)
        return schemas.UserRead.model_validate(user)

    token = _ensure_token(authorization)
    try:
        tg_user = verify_session_token(token) 
    except Exception as exc: 
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session token") from exc

    payload = schemas.UserCreate(
        id=tg_user.get("id"),
        first_name=tg_user.get("first_name"),
        last_name=tg_user.get("last_name"),
        username=tg_user.get("username"),
    )
    
    # Асинхронный вызов CRUD требует await
    user = await crud.create_or_update_user(db, payload)
    
    return schemas.UserRead.model_validate(user)