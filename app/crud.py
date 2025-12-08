from __future__ import annotations

import random
import string
from datetime import date
from typing import Iterable, Optional

# Меняем импорт сессии на асинхронную
from sqlalchemy.ext.asyncio import AsyncSession 
from sqlalchemy import select, and_, or_, delete
from sqlalchemy.orm import selectinload
# Session больше не нужна: from sqlalchemy.orm import Session 

from app import schemas, models


# Генерация кода не выполняет I/O, оставляем синхронной
def _generate_invite() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


# ----------------------------------------------------------------------
# USER FUNCTIONS
# ----------------------------------------------------------------------

async def get_user(db: AsyncSession, user_id: int) -> Optional[models.User]:
    """Асинхронное получение пользователя по ID."""
    # db.get() работает с AsyncSession асинхронно
    return await db.get(models.User, user_id)


async def create_or_update_user(db: AsyncSession, payload: schemas.UserCreate) -> models.User:
    """Асинхронное создание или обновление пользователя."""
    # Вызываем асинхронную версию get_user
    user = await get_user(db, payload.id)
    
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
        
    # Асинхронный commit и refresh
    await db.commit()
    await db.refresh(user)
    return user


async def enable_user_notifications(db: AsyncSession, user_id: int) -> None:
    """Включение уведомлений для пользователя."""
    user = await get_user(db, user_id)
    if user and not user.telegram_notifications_enabled:
        user.telegram_notifications_enabled = True
        await db.commit()
        await db.refresh(user)


# ----------------------------------------------------------------------
# FAMILY FUNCTIONS
# ----------------------------------------------------------------------

async def create_family(db: AsyncSession, owner_id: int, name: str) -> models.Family:
    """Асинхронное создание семьи с уникальным инвайт-кодом."""
    invite_code = _generate_invite()
    
    # Асинхронная проверка уникальности кода
    stmt = select(models.Family).where(models.Family.invite_code == invite_code)
    while await db.scalar(stmt):
        invite_code = _generate_invite()

    family = models.Family(name=name, owner_id=owner_id, invite_code=invite_code)
    db.add(family)
    
    # Асинхронный commit
    await db.commit()
    await db.refresh(family)

    membership = models.FamilyMembership(user_id=owner_id, family_id=family.id, role="owner")
    db.add(membership)
    
    # Второй асинхронный commit
    await db.commit()
    await db.refresh(family)
    
    return family


async def get_family_by_id(db: AsyncSession, family_id: int) -> Optional[models.Family]:
    """Асинхронное получение семьи по ID."""
    return await db.get(models.Family, family_id)


async def get_family_by_invite(db: AsyncSession, invite_code: str) -> Optional[models.Family]:
    """Асинхронное получение семьи по коду приглашения."""
    # Нормализуем код: просто убираем пробелы
    normalized_code = invite_code.strip()
    # Используем ilike для регистронезависимого поиска
    stmt = select(models.Family).where(models.Family.invite_code.ilike(normalized_code))
    # Использование .scalar_one_or_none() или .first() для получения объекта
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def is_member(db: AsyncSession, user_id: int, family_id: int) -> bool:
    """Асинхронная проверка членства пользователя в семье (незаблокированного)."""
    stmt = select(models.FamilyMembership).where(
        models.FamilyMembership.user_id == user_id,
        models.FamilyMembership.family_id == family_id,
        models.FamilyMembership.blocked == False,
    )
    # Используем .first() для быстрой проверки существования записи
    result = await db.execute(stmt)
    return result.scalar_one_or_none() is not None


async def list_user_families(db: AsyncSession, user_id: int) -> list[models.FamilyMembership]:
    """Асинхронное получение всех записей о членстве пользователя в группах."""
    stmt = (
        select(models.FamilyMembership)
        .where(models.FamilyMembership.user_id == user_id)
        .options(selectinload(models.FamilyMembership.family))
    )
    # .scalars().all() для получения списка объектов модели
    result = await db.execute(stmt)
    return result.scalars().all()


async def add_user_to_family(db: AsyncSession, user_id: int, invite_code: str) -> models.Family:
    """Асинхронное добавление пользователя в семью по коду приглашения."""
    # Вызываем асинхронные версии функций
    family = await get_family_by_invite(db, invite_code)
    if not family:
        # Для CRUD лучше возвращать None или использовать HTTPException в роутере
        raise ValueError("Family not found")
        
    if await is_member(db, user_id, family.id):
        return family

    membership = models.FamilyMembership(user_id=user_id, family_id=family.id)
    db.add(membership)
    
    # Асинхронный commit
    await db.commit()
    await db.refresh(family)
    return family


async def remove_user_from_family(db: AsyncSession, user_id: int, family_id: int) -> None:
    """Асинхронное удаление пользователя из семьи."""
    stmt = delete(models.FamilyMembership).where(
        models.FamilyMembership.user_id == user_id,
        models.FamilyMembership.family_id == family_id
    )
    await db.execute(stmt)
    await db.commit()


async def is_owner(db: AsyncSession, user_id: int, family_id: int) -> bool:
    """Проверка, является ли пользователь владельцем семьи."""
    family = await get_family_by_id(db, family_id)
    return family is not None and family.owner_id == user_id


async def list_family_members(
    db: AsyncSession, 
    family_id: int
) -> list[models.FamilyMembership]:
    """Получение списка всех участников семьи."""
    stmt = (
        select(models.FamilyMembership)
        .where(models.FamilyMembership.family_id == family_id)
        .options(selectinload(models.FamilyMembership.user))
    )
    result = await db.execute(stmt)
    return result.scalars().all()


async def block_family_member(
    db: AsyncSession,
    owner_id: int,
    family_id: int,
    member_user_id: int
) -> None:
    """Блокировка участника семьи (только для владельца)."""
    if not await is_owner(db, owner_id, family_id):
        raise PermissionError("Only owner can block members")
    
    if owner_id == member_user_id:
        raise ValueError("Owner cannot block themselves")
    
    stmt = select(models.FamilyMembership).where(
        models.FamilyMembership.family_id == family_id,
        models.FamilyMembership.user_id == member_user_id
    )
    result = await db.execute(stmt)
    membership = result.scalar_one_or_none()
    
    if not membership:
        raise ValueError("Member not found")
    
    membership.blocked = True
    await db.commit()


async def unblock_family_member(
    db: AsyncSession,
    owner_id: int,
    family_id: int,
    member_user_id: int
) -> None:
    """Разблокировка участника семьи (только для владельца)."""
    if not await is_owner(db, owner_id, family_id):
        raise PermissionError("Only owner can unblock members")
    
    stmt = select(models.FamilyMembership).where(
        models.FamilyMembership.family_id == family_id,
        models.FamilyMembership.user_id == member_user_id
    )
    result = await db.execute(stmt)
    membership = result.scalar_one_or_none()
    
    if not membership:
        raise ValueError("Member not found")
    
    membership.blocked = False
    await db.commit()


async def remove_family_member(
    db: AsyncSession,
    owner_id: int,
    family_id: int,
    member_user_id: int
) -> None:
    """Удаление участника из семьи (только для владельца)."""
    if not await is_owner(db, owner_id, family_id):
        raise PermissionError("Only owner can remove members")
    
    if owner_id == member_user_id:
        raise ValueError("Owner cannot remove themselves")
    
    await remove_user_from_family(db, member_user_id, family_id)


# ----------------------------------------------------------------------
# TASK FUNCTIONS
# ----------------------------------------------------------------------

async def list_tasks(
    db: AsyncSession,
    user_id: int,
    start: date,
    end: date,
    scope: str,
    family_id: Optional[int],
) -> Iterable[models.Task]:
    """Асинхронное получение списка задач с фильтрацией по дате и области."""
    conditions = [models.Task.date.between(start, end)]

    if scope == "personal":
        conditions.append(models.Task.owner_id == user_id)
        conditions.append(models.Task.family_id.is_(None))
    elif scope == "family" and family_id:
        conditions.append(models.Task.family_id == family_id)
    else:
        # Асинхронный вызов list_user_families
        memberships = await list_user_families(db, user_id)
        family_ids = [m.family_id for m in memberships]
        
        # Если групп нет, используем [0] для предотвращения пустого списка in_()
        # Но PostgreSQL/SQLAlchemy может потребовать явного where(False)
        family_filter = models.Task.family_id.in_(family_ids) if family_ids else False

        conditions.append(
            or_(
                and_(models.Task.owner_id == user_id, models.Task.family_id.is_(None)),
                family_filter,
            )
        )

    stmt = select(models.Task).where(*conditions).order_by(models.Task.date, models.Task.start_time)
    
    # Асинхронное выполнение запроса и получение всех объектов
    result = await db.execute(stmt)
    return result.scalars().all()


async def create_task(
    db: AsyncSession,
    owner_id: int,
    payload: schemas.TaskCreate,
) -> models.Task:
    """Асинхронное создание новой задачи."""
    task = models.Task(
        owner_id=owner_id,
        family_id=payload.family_id if payload.scope == "family" else None,
        title=payload.title,
        description=payload.description,
        date=payload.date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        scope=models.TaskScope(payload.scope),
        tags=payload.tags,
        color=payload.color,
        notify_before_days=payload.notify_before_days,
        notify_before_hours=payload.notify_before_hours,
    )
    db.add(task)
    
    # Асинхронный commit
    await db.commit()
    await db.refresh(task)
    return task


async def update_task(
    db: AsyncSession,
    user_id: int,
    task_id: int,
    payload: schemas.TaskUpdate,
) -> models.Task:
    """Обновление задачи (в том числе смена даты для канбана)."""
    task = await db.get(models.Task, task_id)
    if not task:
        raise ValueError("Task not found")

    if task.scope == models.TaskScope.personal:
        if task.owner_id != user_id:
            raise PermissionError("Forbidden")
    elif task.scope == models.TaskScope.family:
        if not task.family_id or not await is_member(db, user_id, task.family_id):
            raise PermissionError("Forbidden")

    for field in ["title", "description", "date", "start_time", "end_time", "tags", "color", "notify_before_days", "notify_before_hours"]:
        value = getattr(payload, field)
        if value is not None:
            setattr(task, field, value)

    await db.commit()
    await db.refresh(task)
    return task


async def delete_task(
    db: AsyncSession,
    user_id: int,
    task_id: int,
) -> None:
    """Удаление задачи с проверкой прав."""
    task = await db.get(models.Task, task_id)
    if not task:
        raise ValueError("Task not found")

    if task.scope == models.TaskScope.personal:
        if task.owner_id != user_id:
            raise PermissionError("Forbidden")
    elif task.scope == models.TaskScope.family:
        if not task.family_id or not await is_member(db, user_id, task.family_id):
            raise PermissionError("Forbidden")

    await db.delete(task)
    await db.commit()