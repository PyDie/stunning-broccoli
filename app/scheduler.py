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
    Вызывается периодически (каждые 30 минут).
    """
    async with AsyncSessionLocal() as db:
        now = datetime.now()
        today = now.date()
        tomorrow = today + timedelta(days=1)
        
        # Находим все задачи с настройками уведомлений, которые начинаются сегодня или завтра
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
                # Уведомление за день до начала задачи
                if task.notify_before_days and task.date == tomorrow:
                    # Проверяем, что сейчас подходящее время (в течение дня)
                    # Отправляем уведомление в первой половине дня (до 12:00)
                    if now.hour < 12:
                        task_time = task.start_time.strftime("%H:%M") if task.start_time else None
                        await notifications.notify_upcoming_task(
                            user_id=task.owner_id,
                            task_title=task.title,
                            task_date=task.date.strftime("%d.%m.%Y"),
                            task_time=task_time,
                            db=db
                        )
                        sent_count += 1
                        logger.info(f"✓ Отправлено уведомление за день для задачи '{task.title}' (ID: {task.id})")
                
                # Уведомление за час до начала задачи
                if task.notify_before_hours and task.start_time:
                    # Вычисляем время начала задачи
                    task_datetime = datetime.combine(task.date, task.start_time)
                    notification_time = task_datetime - timedelta(hours=1)
                    
                    # Проверяем, что текущее время в пределах окна уведомления
                    # (от времени уведомления до времени начала задачи, но не более чем за 2 часа)
                    time_diff = (task_datetime - now).total_seconds() / 3600  # разница в часах
                    
                    if 0.5 <= time_diff <= 1.5:  # От 30 минут до 1.5 часов до начала
                        await notifications.notify_upcoming_task(
                            user_id=task.owner_id,
                            task_title=task.title,
                            task_date=task.date.strftime("%d.%m.%Y"),
                            task_time=task.start_time.strftime("%H:%M"),
                            db=db
                        )
                        sent_count += 1
                        logger.info(f"✓ Отправлено уведомление за час для задачи '{task.title}' (ID: {task.id})")
            
            except Exception as e:
                logger.error(f"✗ Ошибка при отправке уведомления для задачи {task.id}: {e}")
        
        if sent_count > 0:
            logger.info(f"Всего отправлено {sent_count} уведомлений о предстоящих задачах")


async def run_scheduler():
    """
    Запускает планировщик уведомлений.
    Проверяет задачи каждые 15 минут для более точного тайминга.
    """
    logger.info("Планировщик уведомлений запущен")
    while True:
        try:
            await check_and_send_upcoming_notifications()
        except Exception as e:
            logger.error(f"Ошибка в планировщике уведомлений: {e}")
        
        # Ждем 15 минут до следующей проверки (для более точного тайминга уведомлений за час)
        await asyncio.sleep(15 * 60)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_scheduler())
