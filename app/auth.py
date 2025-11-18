from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import datetime, timedelta
from typing import Any
# Используем parse_qsl для правильного декодирования URL-строки
from urllib.parse import parse_qsl

from itsdangerous import URLSafeTimedSerializer

from app.config import get_settings

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

settings = get_settings()
serializer = URLSafeTimedSerializer(settings.jwt_secret)


def _check_webapp_signature(data: str) -> dict[str, Any]:
    """Verify Telegram WebApp init_data signature."""
    
    # 1. Парсим строку запроса в словарь с автоматическим URL-декодированием
    try:
        parsed_data = dict(parse_qsl(data, strict_parsing=True))
    except ValueError:
        # Если строка пустая или битая
        logger.error("Init data parsing failed")
        if settings.tg_skip_signature_check:
             return {}
        raise ValueError("Invalid init_data format")

    # 2. Извлекаем и удаляем hash
    hash_received = parsed_data.pop("hash", None)
    
    if not hash_received:
        if not settings.tg_skip_signature_check:
            raise ValueError("Missing hash in init_data")
        logger.warning("Missing hash in init_data, but continuing in dev mode")
        return _decode_user_json(parsed_data)

    # 3. Подготовка строки проверки: key=value\n (ключи отсортированы по алфавиту)
    # Важно: значения здесь уже декодированы (без %20 и т.д.), именно так считает Telegram
    data_check_string = "\n".join(
        f"{k}={parsed_data[k]}" for k in sorted(parsed_data.keys())
    )

    # 4. Генерируем Secret Key по спецификации Telegram (WebAppData)
    secret_key = hmac.new(
        key=b"WebAppData", 
        msg=settings.bot_token.encode(), 
        digestmod=hashlib.sha256
    ).digest()

    # 5. Считаем хэш
    calculated_hash = hmac.new(
        key=secret_key, 
        msg=data_check_string.encode(), 
        digestmod=hashlib.sha256
    ).hexdigest()

    # 6. Сравниваем полученный и рассчитанный хэши
    if calculated_hash != hash_received:
        error_msg = (
            f"Invalid signature. "
            f"Expected: {calculated_hash[:8]}..., "
            f"Got: {hash_received[:8]}..."
        )
        
        if settings.tg_skip_signature_check:
            logger.warning("%s - continuing in dev mode", error_msg)
        else:
            logger.error("%s - rejecting request", error_msg)
            raise ValueError("Invalid signature")

    return _decode_user_json(parsed_data)


def _decode_user_json(payload: dict[str, Any]) -> dict[str, Any]:
    """Parse the nested 'user' JSON string into a dict."""
    if "user" in payload and isinstance(payload["user"], str):
        try:
            payload["user"] = json.loads(payload["user"])
        except json.JSONDecodeError as e:
            logger.warning("Failed to decode user JSON: %s", e)
    return payload


def create_session_token(init_data: str) -> str:
    # Валидация
    data = _check_webapp_signature(init_data)
    
    user = data.get("user")
    if not user:
        # В dev режиме может вернуться пустой dict, если проверка пропущена
        if settings.tg_skip_signature_check:
             # Mock user for dev mode if needed, or raise error
             logger.warning("No user data found (dev mode)")
             user = {"id": 0, "username": "dev_user"}
        else:
            raise ValueError("User info missing")
            
    logger.info("Auth success for user_id=%s username=%s", user.get("id"), user.get("username"))

    expires = datetime.utcnow() + timedelta(hours=6)
    return serializer.dumps({"tg_user": user, "exp": expires.timestamp()})


def verify_session_token(token: str) -> dict[str, Any]:
    try:
        data = serializer.loads(token, max_age=6 * 3600)
        return data["tg_user"]
    except Exception as e:
        # Хорошей практикой считается ловить ошибки сериализатора (BadSignature, SignatureExpired)
        raise ValueError(f"Invalid session token: {e}")