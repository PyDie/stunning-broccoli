from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import get_settings


# 1. Объявление Base остается прежним
class Base(DeclarativeBase):
    pass


settings = get_settings()

# 2. Модификация DATABASE_URL для асинхронного диалекта
# 'postgresql://...' -> 'postgresql+asyncpg://...'
# Pydantic Settings должен предоставлять URL в формате postgresql://
ASYNC_DATABASE_URL = settings.database_url.replace(
    "postgresql://", "postgresql+asyncpg://"
)

# 3. Создание асинхронного движка (Engine)
# 'future=True' не требуется для async_engine, т.к. он всегда "future"
engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=False
)

# 4. Создание асинхронной фабрики сессий
AsyncSessionLocal = async_sessionmaker(
    bind=engine, 
    autoflush=False, 
    autocommit=False, 
    expire_on_commit=False # Рекомендуется для AsyncSession
)


# 5. Асинхронный генератор зависимостей (Dependency)
async def get_async_db():
    """
    Асинхронный генератор для получения сессии базы данных FastAPI.
    """
    async with AsyncSessionLocal() as db:
        yield db