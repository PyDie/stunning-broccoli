from __future__ import annotations

import random
import string
from datetime import date
from typing import Iterable, Optional

from sqlalchemy import select, and_, or_
from sqlalchemy.orm import Session

from app import schemas, models


def get_user(db: Session, user_id: int) -> Optional[models.User]:
    return db.get(models.User, user_id)


def create_or_update_user(db: Session, payload: schemas.UserCreate) -> models.User:
    user = get_user(db, payload.id)
    if user:
        user.first_name = payload.first_name
        user.last_name = payload.last_name
        user.username = payload.username
    else:
        user = models.User(
            id=payload.id,
            first_name=payload.first_name,
            last_name=payload.last_name,
            username=payload.username,
        )
        db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _generate_invite() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


def create_family(db: Session, owner_id: int, name: str) -> models.Family:
    invite_code = _generate_invite()
    while db.scalar(select(models.Family).where(models.Family.invite_code == invite_code)):
        invite_code = _generate_invite()

    family = models.Family(name=name, owner_id=owner_id, invite_code=invite_code)
    db.add(family)
    db.commit()
    db.refresh(family)

    membership = models.FamilyMembership(user_id=owner_id, family_id=family.id, role="owner")
    db.add(membership)
    db.commit()
    return family


def get_family_by_id(db: Session, family_id: int) -> Optional[models.Family]:
    return db.get(models.Family, family_id)


def get_family_by_invite(db: Session, invite_code: str) -> Optional[models.Family]:
    stmt = select(models.Family).where(models.Family.invite_code == invite_code.upper())
    return db.scalars(stmt).first()


def is_member(db: Session, user_id: int, family_id: int) -> bool:
    stmt = select(models.FamilyMembership).where(
        models.FamilyMembership.user_id == user_id,
        models.FamilyMembership.family_id == family_id,
    )
    return db.scalars(stmt).first() is not None


def add_user_to_family(db: Session, user_id: int, invite_code: str) -> models.Family:
    family = get_family_by_invite(db, invite_code)
    if not family:
        raise ValueError("Family not found")
    if is_member(db, user_id, family.id):
        return family

    membership = models.FamilyMembership(user_id=user_id, family_id=family.id)
    db.add(membership)
    db.commit()
    return family


def list_user_families(db: Session, user_id: int) -> list[models.FamilyMembership]:
    stmt = (
        select(models.FamilyMembership)
        .where(models.FamilyMembership.user_id == user_id)
        .options()
    )
    return db.scalars(stmt).all()


def list_tasks(
    db: Session,
    user_id: int,
    start: date,
    end: date,
    scope: str,
    family_id: Optional[int],
) -> Iterable[models.Task]:
    conditions = [models.Task.date.between(start, end)]

    if scope == "personal":
        conditions.append(models.Task.owner_id == user_id)
        conditions.append(models.Task.family_id.is_(None))
    elif scope == "family" and family_id:
        conditions.append(models.Task.family_id == family_id)
    else:
        conditions.append(
            or_(
                and_(models.Task.owner_id == user_id, models.Task.family_id.is_(None)),
                models.Task.family_id.in_(
                    [m.family_id for m in list_user_families(db, user_id)] or [0]
                ),
            )
        )

    stmt = select(models.Task).where(*conditions).order_by(models.Task.date, models.Task.start_time)
    return db.scalars(stmt).all()


def create_task(
    db: Session,
    owner_id: int,
    payload: schemas.TaskCreate,
) -> models.Task:
    task = models.Task(
        owner_id=owner_id,
        family_id=payload.family_id if payload.scope == "family" else None,
        title=payload.title,
        description=payload.description,
        date=payload.date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        scope=models.TaskScope(payload.scope),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task
