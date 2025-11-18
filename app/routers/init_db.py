import asyncio
import logging
import sys

# Важно: нужно импортировать models, чтобы Base.metadata знал о всех таблицах
from app import models 
from app.database import engine, Base 

# Настройка логирования
logging.basicConfig(level=logging.INFO, stream=sys.stdout)
logger = logging.getLogger(__name__)

async def init_models():
    """
    Асинхронное создание всех таблиц в базе данных.
    Использует engine.run_sync() для выполнения синхронной операции 
    (Base.metadata.create_all) в асинхронном контексте.
    """
    logger.info("Начало инициализации базы данных...")
    
    async with engine.begin() as conn:
        # Удаление всех таблиц (опционально, только для первого запуска или сброса)
        # await conn.run_sync(Base.metadata.drop_all)
        
        # Создание всех таблиц
        await conn.run_sync(Base.metadata.create_all)
        
    logger.info("База данных успешно инициализирована!")


if __name__ == "__main__":
    # Выполнение асинхронной функции инициализации
    try:
        asyncio.run(init_models())
    except Exception as e:
        logger.error(f"Ошибка при инициализации БД: {e}")