from functools import lru_cache
from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    bot_token: str
    webapp_url: AnyHttpUrl
    api_base_url: AnyHttpUrl = "http://localhost:8000"
    database_url: str = "sqlite:///./data/tgcalendar.db"
    jwt_secret: str
    tg_skip_signature_check: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
