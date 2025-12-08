from functools import lru_cache
from pydantic_settings import BaseSettings 
from pydantic import Field


class Settings(BaseSettings):
    bot_token: str
    webapp_url: str 
    api_base_url: str = "http://localhost:8000"
    
    # В продакшене должно быть установлено через переменную окружения
    database_url: str = Field(default="", description="Database URL")
    
    jwt_secret: str
    tg_skip_signature_check: bool = False
    
    # Режим работы приложения
    environment: str = Field(default="production", description="Environment: production or development")
    
    # CORS origins для продакшена (через запятую)
    cors_origins: str = Field(default="", description="Allowed CORS origins (comma-separated)")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()