"""
Модуль для планирования уведомлений о предстоящих задачах.
"""
import asyncio
import logging
from datetime import datetime, date, time, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_

from app import models, crud, notifications
from app.database import AsyncSessionLocal

logger = logging.getLogger(__name__)


async def check_and_send_upcoming_notifications():
    """
    Проверяет задачи, для которых нужно отправить уведомления, и отправляет их.
    Вызывается периодически (например, каждый час).
    """
    async with AsyncSessionLocal() as db:
        now = datetime.now()
        today = now.date()
        current_time = now.time()
        
        # Находим задачи, которые начинаются сегодня или завтра
        # и для которых нужно отправить уведомления
        tomorrow = today + timedelta(days=1)
        
        # Задачи, которые начинаются сегодня или завтра
        stmt = select(models.Task).where(
            and_(
                models.Task.date >= today,
                models.Task.date <= tomorrow,
                or_(
                    models.Task.notify_before_days.isnot(None),
                    models.Task.notify_before_hours.isnot(None)
                )
            )
        )
        
        result = await db.execute(stmt)
        tasks = result.scalars().all()
        
        sent_count = 0
        for task in tasks:
            try:
                # Проверяем уведомление за день
                if task.notify_before_days and task.date == tomorrow:
                    # Отправляем уведомление за день
                    task_time = task.start_time.strftime("%H:%M") if task.start_time else None
                    await notifications.notify_upcoming_task(
                        user_id=task.owner_id,
                        task_title=task.title,
                        task_date=task.date.strftime("%d.%m.%Y"),
                        task_time=task_time,
                        db=db
                    )
                    sent_count += 1
                    logger.info(f"Отправлено уведомление за день для задачи {task.id}")
                
                # Проверяем уведомление за час
                if task.notify_before_hours and task.date == today and task.start_time:
                    # Вычисляем время начала задачи
                    task_datetime = datetime.combine(task.date, task.start_time)
                    notification_time = task_datetime - timedelta(hours=1)
                    
                    # Проверяем, что текущее время близко к времени уведомления (в пределах часа)
                    if now >= notification_time and now < task_datetime:
                        # Проверяем, что уведомление еще не было отправлено
                        # (можно добавить поле notified_at в модель для отслеживания)
                        await notifications.notify_upcoming_task(
                            user_id=task.owner_id,
                            task_title=task.title,
                            task_date=task.date.strftime("%d.%m.%Y"),
                            task_time=task.start_time.strftime("%H:%M"),
                            db=db
                        )
                        sent_count += 1
                        logger.info(f"Отправлено уведомление за час для задачи {task.id}")
            
            except Exception as e:
                logger.error(f"Ошибка при отправке уведомления для задачи {task.id}: {e}")
        
        if sent_count > 0:
            logger.info(f"Отправлено {sent_count} уведомлений о предстоящих задачах")


async def run_scheduler():
    """
    Запускает планировщик уведомлений.
    Проверяет задачи каждые 30 минут.
    """
    logger.info("Планировщик уведомлений запущен")
    while True:
        try:
            await check_and_send_upcoming_notifications()
        except Exception as e:
            logger.error(f"Ошибка в планировщике уведомлений: {e}")
        
        # Ждем 30 минут до следующей проверки
        await asyncio.sleep(30 * 60)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_scheduler())
