from __future__ import annotations

from datetime import date, time
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

    class Config:
        from_attributes = True


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


class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: Optional[str]
    date: date
    start_time: Optional[time]
    end_time: Optional[time]
    scope: str = Field(default="personal")
    family_id: Optional[int]


class TaskCreate(TaskBase):
    pass


class TaskRead(TaskBase):
    id: int

    class Config:
        from_attributes = True


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    date: date | str | None = None
    start_time: time | str | None = None
    end_time: time | str | None = None

    @field_validator("date", mode="before")
    def parse_date(cls, v):
        if v in (None, "", 0):
            return None
        if isinstance(v, str):
            return date.fromisoformat(v)
        return v

    @field_validator("start_time", "end_time", mode="before")
    def parse_time(cls, v):
        if v in (None, "", 0):
            return None
        if isinstance(v, str):
            return time.fromisoformat(v)
        return v
