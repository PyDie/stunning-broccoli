from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession # 👈 1. Меняем импорт сессии SQLAlchemy

from app import schemas, crud, models
from app.dependencies import get_current_user
from app.database import get_async_db # 👈 2. Меняем импорт генератора зависимостей

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=schemas.UserRead)
async def read_me( # 👈 3. Функция стала async
    current_user: schemas.UserRead = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db), # 👈 4. Используем AsyncSession и get_async_db
):
    """
    Асинхронно возвращает данные о текущем авторизованном пользователе.
    """
    # 5. Добавляем await перед вызовом асинхронной CRUD-функции
    user = await crud.get_user(db, current_user.id)
    return user


@router.patch("/me/notifications", response_model=schemas.UserRead)
async def update_notification_settings(
    payload: schemas.NotificationSettingsUpdate,
    current_user: schemas.UserRead = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Обновление настроек уведомлений пользователя.
    """
    user = await crud.get_user(db, current_user.id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.telegram_notifications_enabled = payload.telegram_notifications_enabled
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/me/notifications/test")
async def test_notification(
    current_user: schemas.UserRead = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_db),
):
    """
    Тестовая отправка уведомления пользователю.
    """
    from app.notifications import send_telegram_notification
    
    try:
        await send_telegram_notification(
            user_id=current_user.id,
            message="🔔 Это тестовое уведомление! Если вы видите это сообщение, уведомления работают корректно."
        )
        return {"status": "success", "message": "Тестовое уведомление отправлено"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка отправки уведомления: {str(e)}")