from __future__ import annotations

import asyncio
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app import schemas
from app.auth import create_session_token
from app.config import get_settings
from app.database import Base, engine
from app.dependencies import get_current_user
from app.routers import families, tasks, users
from app.routers.migrations import run_migrations

settings = get_settings()
logger = logging.getLogger(__name__)
app = FastAPI(title="TGCalendar API", version="0.1.0")


@app.on_event("startup")
async def startup_event():
    """Выполнение миграций и запуск планировщика при старте приложения."""
    try:
        logger.info("Запуск миграций базы данных...")
        await run_migrations()
        logger.info("Миграции выполнены успешно")
    except Exception as e:
        logger.error(f"Ошибка при выполнении миграций: {e}")
        # Не прерываем запуск приложения, но логируем ошибку
    
    # Запускаем планировщик уведомлений в фоновом режиме
    try:
        from app.scheduler import run_scheduler
        asyncio.create_task(run_scheduler())
        logger.info("Планировщик уведомлений запущен")
    except Exception as e:
        logger.error(f"Ошибка при запуске планировщика уведомлений: {e}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(users.router)
app.include_router(families.router)
app.include_router(tasks.router)


@app.get("/health")
def healthcheck():
    return {"status": "ok"}


@app.post("/migrate")
async def migrate_db():
    """
    Endpoint для выполнения миграций базы данных.
    ВНИМАНИЕ: Используйте только для разработки или с защитой в production!
    """
    try:
        await run_migrations()
        return {"status": "success", "message": "Миграции выполнены успешно"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


class WebAppAuthRequest(BaseModel):
    init_data: str


@app.post("/auth/verify")
def auth_verify(payload: WebAppAuthRequest):
    token = create_session_token(payload.init_data)
    return {"token": token}


@app.get("/me")
def whoami(current_user: schemas.UserRead = Depends(get_current_user)):
    return current_user


webapp_dir = Path(__file__).resolve().parent.parent / "webapp"
if webapp_dir.exists():
    app.mount("/miniapp", StaticFiles(directory=webapp_dir, html=True), name="miniapp")
