"""
Модуль для отправки Telegram-уведомлений.
"""
import logging
from typing import Optional

from aiogram import Bot
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app import crud, models

logger = logging.getLogger(__name__)
settings = get_settings()

# Глобальный экземпляр бота (будет инициализирован при первом использовании)
_bot: Optional[Bot] = None


def get_bot() -> Bot:
    """Получение экземпляра бота для отправки уведомлений."""
    global _bot
    if _bot is None:
        _bot = Bot(token=settings.bot_token)
    return _bot


async def send_telegram_notification(
    user_id: int,
    message: str,
    db: Optional[AsyncSession] = None
) -> bool:
    """
    Отправка уведомления пользователю через Telegram бота.
    
    Args:
        user_id: ID пользователя Telegram
        message: Текст сообщения
        db: Опциональная сессия БД для проверки настроек уведомлений
    
    Returns:
        True если уведомление отправлено успешно, False в противном случае
    """
    try:
        # Если передан db, проверяем настройки уведомлений
        if db:
            user = await crud.get_user(db, user_id)
            if not user or not user.telegram_notifications_enabled:
                logger.info(f"Уведомления отключены для пользователя {user_id}")
                return False
        
        bot = get_bot()
        await bot.send_message(chat_id=user_id, text=message)
        logger.info(f"Уведомление отправлено пользователю {user_id}")
        return True
    except Exception as e:
        logger.error(f"Ошибка отправки уведомления пользователю {user_id}: {e}")
        return False


async def notify_task_created(
    user_id: int,
    task_title: str,
    task_date: str,
    db: Optional[AsyncSession] = None
) -> bool:
    """Уведомление о создании новой задачи."""
    message = f"✅ Создана новая задача: {task_title}\n📅 Дата: {task_date}"
    return await send_telegram_notification(user_id, message, db)


async def notify_task_updated(
    user_id: int,
    task_title: str,
    task_date: str,
    db: Optional[AsyncSession] = None
) -> bool:
    """Уведомление об обновлении задачи."""
    message = f"✏️ Задача обновлена: {task_title}\n📅 Дата: {task_date}"
    return await send_telegram_notification(user_id, message, db)


async def notify_task_deleted(
    user_id: int,
    task_title: str,
    db: Optional[AsyncSession] = None
) -> bool:
    """Уведомление об удалении задачи."""
    message = f"🗑️ Задача удалена: {task_title}"
    return await send_telegram_notification(user_id, message, db)


async def notify_family_member_added(
    user_id: int,
    family_name: str,
    new_member_name: str,
    db: Optional[AsyncSession] = None
) -> bool:
    """Уведомление о добавлении нового участника в группу."""
    message = f"👥 В группу \"{family_name}\" присоединился {new_member_name}"
    return await send_telegram_notification(user_id, message, db)


async def notify_upcoming_task(
    user_id: int,
    task_title: str,
    task_date: str,
    task_time: Optional[str] = None,
    db: Optional[AsyncSession] = None
) -> bool:
    """Уведомление о предстоящей задаче."""
    time_str = f" в {task_time}" if task_time else ""
    message = f"⏰ Напоминание: {task_title}\n📅 {task_date}{time_str}"
    return await send_telegram_notification(user_id, message, db)
