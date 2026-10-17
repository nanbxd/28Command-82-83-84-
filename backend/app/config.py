from functools import lru_cache
from pathlib import Path
from pydantic import SecretStr

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://ic:ic@localhost:5433/ic"
    frontend_origin: str = "http://localhost:5173"
    superadmin_email: str = ""
    superadmin_password: SecretStr = SecretStr("")
    groq_api_key: SecretStr = SecretStr("")
    groq_model: str = "openai/gpt-oss-120b"
    platform_api_key: SecretStr = SecretStr("")
    model_config = SettingsConfigDict(env_file=(Path(__file__).resolve().parents[2] / '.env', Path(__file__).resolve().parents[1] / '.env'), extra="ignore")

    @property
    def sqlalchemy_url(self) -> str:
        # Render supplies a postgresql:// connection string.
        value = self.database_url
        if value.startswith(("postgres://", "postgresql://")):
            return "postgresql+psycopg://" + value.split("://", 1)[1]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
