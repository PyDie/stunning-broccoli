import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession # 👈 1. Меняем импорт сессии
from sqlalchemy import select, insert, delete, and_
from sqlalchemy.orm import selectinload

from app import schemas, crud, models
from app.dependencies import get_current_user
from app.database import get_async_db # 👈 2. Меняем импорт зависимости

router = APIRouter(prefix="/families", tags=["families"])

# -----------------------------------------------------------
# 1. GET /families
# -----------------------------------------------------------
@router.get("", response_model=list[schemas.FamilyRead])
async def list_families( # 👈 3. Функция стала async
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db), # 👈 4. Используем AsyncSession и get_async_db
):
    """
    Асинхронно возвращает список семей, в которых состоит текущий пользователь.
    Для асинхронной загрузки связей используем selectinload.
    """
    # 5. Переписываем логику, чтобы она использовала execute()
    
    # 5.1. Загружаем пользователя с его членством в семьях
    # selectinload(User.families) загружает FamilyMembership за один запрос
    user_stmt = select(models.User).where(models.User.id == current_user.id).options(
        selectinload(models.User.families).selectinload(models.FamilyMembership.family)
    )
    user_result = await db.execute(user_stmt) # 👈 Асинхронное выполнение
    
    # Получаем обновленный объект User с загруженными связями
    loaded_user = user_result.scalar_one()

    # Берем список членств (FamilyMembership) из загруженного пользователя
    memberships = loaded_user.families
    
    # Извлекаем из них объекты Family (эта часть остается синхронной, т.к. данные уже в памяти)
    return [m.family for m in memberships]


# -----------------------------------------------------------
# 2. POST /families
# -----------------------------------------------------------
@router.post("", response_model=schemas.FamilyRead, status_code=status.HTTP_201_CREATED)
async def create_family( # 👈 3. Функция стала async
    payload: schemas.FamilyCreate,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db), # 👈 4. Используем AsyncSession и get_async_db
):
    """
    Асинхронное создание семьи и добавление создателя как owner.
    """
    invite_code = str(uuid.uuid4())[:8]
    
    # 5. Создание записи Family (можно использовать SQLAlchemy Core или ORM, тут ORM)
    new_family = models.Family(
        name=payload.name,
        owner_id=current_user.id,
        invite_code=invite_code
    )
    db.add(new_family)
    # 6. Асинхронный commit
    await db.commit() 
    
    # db.refresh(new_family)
    # В асинхронном режиме refresh может быть сложным. 
    # Лучше использовать selectinload или просто вернуть new_family, 
    # если не нужны свежие автоматически сгенерированные поля, кроме ID.
    
    # 7. Создаем запись о членстве для создателя
    membership = models.FamilyMembership(
        user_id=current_user.id,
        family_id=new_family.id,
        role="owner"
    )
    db.add(membership)
    # 8. Второй асинхронный commit
    await db.commit()
    await db.refresh(new_family) # Refresh после commit для ID и других полей

    return new_family


# -----------------------------------------------------------
# 3. POST /families/{family_id}/join
# -----------------------------------------------------------
@router.post("/{family_id}/join", response_model=schemas.FamilyRead)
async def join_family( # 👈 3. Функция стала async
    family_id: int,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db), # 👈 4. Используем AsyncSession и get_async_db
):
    """
    Асинхронное вступление в семью по ID.
    """
    # 5. Ищем семью: используем select() и await db.execute()
    family_stmt = select(models.Family).where(models.Family.id == family_id)
    family_result = await db.execute(family_stmt)
    family = family_result.scalar_one_or_none()
    
    if not family:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Семья не найдена"
        )

    # 6. Проверяем, не состоит ли уже (используем select() с and_)
    membership_stmt = select(models.FamilyMembership).where(
        and_(
            models.FamilyMembership.family_id == family_id, 
            models.FamilyMembership.user_id == current_user.id
        )
    )
    existing_membership_result = await db.execute(membership_stmt)
    existing_membership = existing_membership_result.scalar_one_or_none()
    
    if existing_membership:
        # Если уже состоит, просто возвращаем объект Family
        return family

    # 7. Добавляем пользователя
    new_membership = models.FamilyMembership(
        user_id=current_user.id, 
        family_id=family_id, 
        role="member"
    )
    db.add(new_membership)
    # 8. Асинхронный commit
    await db.commit()
    
    return family