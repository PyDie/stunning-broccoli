"""
Модуль для выполнения миграций базы данных.
"""
import asyncio
import logging
import sys
from sqlalchemy import text
from app.database import engine

logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)


async def column_exists(conn, table_name: str, column_name: str) -> bool:
    """Проверка существования колонки в таблице."""
    result = await conn.execute(
        text("""
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = :table_name 
            AND column_name = :column_name
        """),
        {"table_name": table_name, "column_name": column_name}
    )
    return result.scalar() is not None


async def run_migrations():
    """
    Выполнение миграций для добавления новых колонок.
    """
    logger.info("Начало выполнения миграций...")
    
    async with engine.begin() as conn:
        # Миграция 1: Добавление колонки telegram_notifications_enabled в таблицу users
        if not await column_exists(conn, "users", "telegram_notifications_enabled"):
            try:
                await conn.execute(
                    text("ALTER TABLE users ADD COLUMN telegram_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE")
                )
                logger.info("✓ Добавлена колонка telegram_notifications_enabled в таблицу users")
            except Exception as e:
                logger.error(f"✗ Ошибка при добавлении telegram_notifications_enabled: {e}")
        else:
            logger.info("✓ Колонка telegram_notifications_enabled уже существует")
        
        # Миграция 2: Добавление колонки blocked в таблицу family_memberships
        if not await column_exists(conn, "family_memberships", "blocked"):
            try:
                await conn.execute(
                    text("ALTER TABLE family_memberships ADD COLUMN blocked BOOLEAN NOT NULL DEFAULT FALSE")
                )
                logger.info("✓ Добавлена колонка blocked в таблицу family_memberships")
            except Exception as e:
                logger.error(f"✗ Ошибка при добавлении blocked: {e}")
        else:
            logger.info("✓ Колонка blocked уже существует")
    
    logger.info("Миграции завершены!")


if __name__ == "__main__":
    asyncio.run(run_migrations())
