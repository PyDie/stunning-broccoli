import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import schemas, crud, models
from app.dependencies import get_current_user
from app.database import get_db

router = APIRouter(prefix="/families", tags=["families"])


@router.get("", response_model=list[schemas.FamilyRead])
def list_families(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Возвращает список семей через связь current_user.families.
    В models.py у User.families тип Mapped[list[FamilyMembership]], 
    поэтому нужно достать сами объекты Family из memberships.
    """
    # Берем список членств (FamilyMembership)
    memberships = current_user.families
    # Извлекаем из них объекты Family
    return [m.family for m in memberships]


@router.post("", response_model=schemas.FamilyRead, status_code=status.HTTP_201_CREATED)
def create_family(
    payload: schemas.FamilyCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Создание семьи. Генерируем invite_code, так как он обязателен в БД.
    """
    # Генерируем случайный код (например, первые 8 символов UUID)
    invite_code = str(uuid.uuid4())[:8]
    
    new_family = models.Family(
        name=payload.name,
        owner_id=current_user.id,
        invite_code=invite_code
    )
    db.add(new_family)
    db.commit()
    db.refresh(new_family)
    
    # Создаем запись о членстве для создателя
    membership = models.FamilyMembership(
        user_id=current_user.id,
        family_id=new_family.id,
        role="owner"
    )
    db.add(membership)
    db.commit()
    
    return new_family


@router.post("/{family_id}/join", response_model=schemas.FamilyRead)
def join_family(
    family_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Вступление в семью по ID.
    Используется при переходе по ссылке-приглашению.
    """
    # 1. Ищем семью
    family = db.query(models.Family).filter(models.Family.id == family_id).first()
    if not family:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Семья не найдена"
        )

    # 2. Проверяем, не состоит ли уже (используем FamilyMembership)
    existing_membership = db.query(models.FamilyMembership).filter_by(
        family_id=family_id, 
        user_id=current_user.id
    ).first()
    
    if existing_membership:
        return family

    # 3. Добавляем пользователя
    new_membership = models.FamilyMembership(
        user_id=current_user.id, 
        family_id=family_id, 
        role="member"
    )
    db.add(new_membership)
    db.commit()
    
    return family