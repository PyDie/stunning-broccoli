from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app import schemas, crud
from app.dependencies import get_current_user
from app.database import get_db

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[schemas.TaskRead])
def list_tasks(
    start: date = Query(...),
    end: date = Query(...),
    scope: str = Query("personal"),
    family_id: int | None = Query(default=None),
    current_user: schemas.UserRead = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tasks = crud.list_tasks(db, current_user.id, start, end, scope, family_id)
    return tasks


@router.post("", response_model=schemas.TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: schemas.TaskCreate,
    current_user: schemas.UserRead = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = crud.create_task(db, current_user.id, payload)
    return task
