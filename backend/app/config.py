from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://ic:ic_local_demo@localhost:5433/ic"
    frontend_origin: str = "http://localhost:5173"
    demo_mode: bool = False
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

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
