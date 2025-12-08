from __future__ import annotations

from datetime import date, time
from enum import Enum as PyEnum
from typing import Optional

from sqlalchemy import String, ForeignKey, UniqueConstraint, Date, Time, Enum as SAEnum, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)  # Telegram user id
    first_name: Mapped[str | None] = mapped_column(String(64))
    last_name: Mapped[str | None] = mapped_column(String(64))
    username: Mapped[str | None] = mapped_column(String(64))
    telegram_notifications_enabled: Mapped[bool] = mapped_column(default=True, nullable=False)

    families: Mapped[list[FamilyMembership]] = relationship("FamilyMembership", back_populates="user")
    tasks: Mapped[list[Task]] = relationship("Task", back_populates="owner")


class Family(Base):
    __tablename__ = "families"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    invite_code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    owner: Mapped[User] = relationship("User")
    members: Mapped[list[FamilyMembership]] = relationship("FamilyMembership", back_populates="family")
    tasks: Mapped[list[Task]] = relationship("Task", back_populates="family")


class FamilyMembership(Base):
    __tablename__ = "family_memberships"
    __table_args__ = (UniqueConstraint("user_id", "family_id", name="uq_membership"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    family_id: Mapped[int] = mapped_column(ForeignKey("families.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="member")
    blocked: Mapped[bool] = mapped_column(default=False, nullable=False)

    user: Mapped[User] = relationship("User", back_populates="families")
    family: Mapped[Family] = relationship("Family", back_populates="members")


class TaskScope(str, PyEnum):  # type: ignore[misc]
    personal = "personal"
    family = "family"


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    family_id: Mapped[Optional[int]] = mapped_column(ForeignKey("families.id"))
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time | None] = mapped_column(Time)
    end_time: Mapped[time | None] = mapped_column(Time)
    scope: Mapped[TaskScope] = mapped_column(SAEnum(TaskScope), default=TaskScope.personal, nullable=False)

    owner: Mapped[User] = relationship("User", back_populates="tasks")
    family: Mapped[Family | None] = relationship("Family", back_populates="tasks")
