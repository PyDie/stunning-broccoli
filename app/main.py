from __future__ import annotations

from pathlib import Path

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

Base.metadata.create_all(bind=engine)

settings = get_settings()
app = FastAPI(title="TGCalendar API", version="0.1.0")

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
