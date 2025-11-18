from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas, crud
from app.dependencies import get_current_user
from app.database import get_db

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=schemas.UserRead)
def read_me(
    current_user: schemas.UserRead = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = crud.get_user(db, current_user.id)
    return user
