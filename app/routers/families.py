import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app import schemas, crud, models
from app.dependencies import get_current_user
from app.database import get_async_db

router = APIRouter(prefix="/families", tags=["families"])
logger = logging.getLogger(__name__)

# -----------------------------------------------------------
# 1. GET /families
# -----------------------------------------------------------
@router.get("", response_model=list[schemas.FamilyRead])
async def list_families(
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Асинхронно возвращает список семей, в которых состоит текущий пользователь.
    Для асинхронной загрузки связей используем selectinload.
    """
    # Загружаем пользователя с его членством в семьях
    # selectinload(User.families) загружает FamilyMembership за один запрос
    user_stmt = select(models.User).where(models.User.id == current_user.id).options(
        selectinload(models.User.families).selectinload(models.FamilyMembership.family)
    )
    user_result = await db.execute(user_stmt)
    
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
async def create_family(
    payload: schemas.FamilyCreate,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Асинхронное создание семьи и добавление создателя как owner.
    """
    invite_code = str(uuid.uuid4())[:8]
    
    new_family = models.Family(
        name=payload.name,
        owner_id=current_user.id,
        invite_code=invite_code
    )
    db.add(new_family)
    await db.commit() 
    
    # Создаем запись о членстве для создателя
    membership = models.FamilyMembership(
        user_id=current_user.id,
        family_id=new_family.id,
        role="owner"
    )
    db.add(membership)
    await db.commit()
    await db.refresh(new_family)

    return new_family


# -----------------------------------------------------------
# 3. POST /families/join
# -----------------------------------------------------------
@router.post("/join", response_model=schemas.FamilyRead)
async def join_family_by_invite(
    payload: schemas.FamilyJoin,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Вступление в семью по инвайт-коду (без перебора числовых ID).
    """
    logger.info(f"User {current_user.id} attempting to join family with code: {payload.invite_code}")
    try:
        family = await crud.add_user_to_family(db, current_user.id, payload.invite_code)
        logger.info(f"User {current_user.id} joined family {family.id}")
        return family
    except ValueError as e:
        logger.warning(f"Join failed for code {payload.invite_code}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family with this invite code not found"
        )
    except Exception as e:
        logger.error(f"Unexpected error during join family: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during join"
        )


# -----------------------------------------------------------
# 4. DELETE /families/{family_id}/leave
# -----------------------------------------------------------
@router.delete("/{family_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_family(
    family_id: int,
    current_user: models.User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Выход текущего пользователя из семьи.
    """
    logger.info(f"User {current_user.id} attempting to leave family {family_id}")
    try:
        if not await crud.is_member(db, current_user.id, family_id):
            logger.warning(f"User {current_user.id} tried to leave non-member family {family_id}")
            raise HTTPException(status_code=404, detail="Family membership not found")
            
        await crud.remove_user_from_family(db, current_user.id, family_id)
        logger.info(f"User {current_user.id} left family {family_id}")
        return None
    except HTTPException:
        raise
    except Exception as e:
                logger.error(f"Error leaving family: {e}")
                # Return the actual error message for debugging
                raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
