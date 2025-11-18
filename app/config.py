from functools import lru_cache
# Убираем AnyHttpUrl из импортов, т.к. будем использовать str
from pydantic_settings import BaseSettings 
from pydantic import Field # Импортируем Field для установки нового типа по умолчанию


class Settings(BaseSettings):
    bot_token: str
    # 1. Меняем AnyHttpUrl на str. (URL веб-приложения, вероятно, не должен быть жестко привязан к HTTP/HTTPS)
    webapp_url: str 
    api_base_url: str = "http://localhost:8000" # Меняем на str, чтобы быть последовательными
    
    # 2. Устанавливаем значение по умолчанию для Postgre, если нет переменной окружения
    # В реальной среде это будет переопределено переменной DATABASE_URL
    database_url: str = "postgresql://postgres:postgres@localhost:5432/tgcalendar_db" 
    
    jwt_secret: str
    tg_skip_signature_check: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()