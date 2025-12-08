from datetime import date

from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession # 👈 1. Меняем импорт сессии SQLAlchemy

from app import schemas, crud, models, notifications
from app.dependencies import get_current_user
from app.database import get_async_db # 👈 2. Меняем импорт генератора зависимостей

router = APIRouter(prefix="/tasks", tags=["tasks"])


# -----------------------------------------------------------
# 1. GET /tasks
# -----------------------------------------------------------
@router.get("", response_model=list[schemas.TaskRead])
async def list_tasks( # 👈 3. Функция стала async
    start: date = Query(...),
    end: date = Query(...),
    scope: str = Query("personal"),
    family_id: int | None = Query(default=None),
    current_user: schemas.UserRead = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db), # 👈 4. Используем AsyncSession и get_async_db
):
    """
    Асинхронно возвращает список задач для заданного периода и области (личные/групповые).
    """
    # 5. Добавляем await перед вызовом асинхронной CRUD-функции
    tasks = await crud.list_tasks(db, current_user.id, start, end, scope, family_id)
    return tasks


# -----------------------------------------------------------
# 2. POST /tasks
# -----------------------------------------------------------
@router.post("", response_model=schemas.TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task( # 👈 3. Функция стала async
    payload: schemas.TaskCreate,
    current_user: schemas.UserRead = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db), # 👈 4. Используем AsyncSession и get_async_db
):
    """
    Асинхронное создание новой задачи.
    """
    # 5. Добавляем await перед вызовом асинхронной CRUD-функции
    task = await crud.create_task(db, current_user.id, payload)
    
    # Отправляем уведомление о создании задачи
    await notifications.notify_task_created(
        user_id=current_user.id,
        task_title=task.title,
        task_date=str(task.date),
        db=db
    )
    
    return task


@router.patch("/{task_id}", response_model=schemas.TaskRead)
async def update_task(
    task_id: int,
    payload: schemas.TaskUpdate,
    current_user: schemas.UserRead = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    try:
        task = await crud.update_task(db, current_user.id, task_id, payload)
        
        # Отправляем уведомление об обновлении задачи
        await notifications.notify_task_updated(
            user_id=current_user.id,
            task_title=task.title,
            task_date=str(task.date),
            db=db
        )
        
        return task
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: int,
    current_user: schemas.UserRead = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    try:
        # Получаем задачу перед удалением для уведомления
        task = await db.get(models.Task, task_id)
        task_title = task.title if task else "Задача"
        
        await crud.delete_task(db, current_user.id, task_id)
        
        # Отправляем уведомление об удалении задачи
        if task:
            await notifications.notify_task_deleted(
                user_id=current_user.id,
                task_title=task_title,
                db=db
            )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc