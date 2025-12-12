from __future__ import annotations

from datetime import date, time
import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class UserCreate(BaseModel):
    id: int
    first_name: Optional[str]
    last_name: Optional[str]
    username: Optional[str]


class UserRead(BaseModel):
    id: int
    first_name: Optional[str]
    last_name: Optional[str]
    username: Optional[str]
    telegram_notifications_enabled: bool = True

    class Config:
        from_attributes = True


class NotificationSettingsUpdate(BaseModel):
    telegram_notifications_enabled: bool


class FamilyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)


class FamilyRead(BaseModel):
    id: int
    name: str
    invite_code: str

    class Config:
        from_attributes = True


class FamilyJoin(BaseModel):
    invite_code: str


class FamilyMemberRead(BaseModel):
    user_id: int
    first_name: Optional[str]
    last_name: Optional[str]
    username: Optional[str]
    role: str
    blocked: bool

    class Config:
        from_attributes = True


class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: Optional[str] = None
    date: date
    start_time: Optional[time]
    end_time: Optional[time]
    scope: str = Field(default="personal")
    family_id: Optional[int]
    tags: Optional[list[str]] = None
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")  # HEX цвет
    notify_before_days: Optional[int] = Field(None, ge=0, le=365)
    notify_before_hours: Optional[int] = Field(None, ge=0, le=24)


class TaskCreate(TaskBase):
    pass


class TaskRead(TaskBase):
    id: int

    class Config:
        from_attributes = True


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    date: Optional[datetime.date] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    scope: Optional[str] = None
    family_id: Optional[int] = None
    tags: Optional[list[str]] = None
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    notify_before_days: Optional[int] = Field(None, ge=0, le=365)
    notify_before_hours: Optional[int] = Field(None, ge=0, le=24)
