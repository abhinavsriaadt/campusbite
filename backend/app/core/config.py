"""Application configuration, loaded from environment variables (and an optional .env file)."""

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "CampusBite API"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    # Business calendar for "today", date filters, daily charts and AI date math.
    APP_TIMEZONE: str = "Asia/Kolkata"

    # Database
    DATABASE_URL: str = "sqlite:///./campusbite.db"

    # Auth
    JWT_SECRET_KEY: str = Field(min_length=32)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12
    BCRYPT_ROUNDS: int = Field(default=12, ge=4, le=16)

    # CORS — comma separated list of allowed origins
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Business rules
    DELIVERY_FEE: float = 40.0
    TAX_RATE: float = 0.05

    # OpenAI
    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = "gpt-5.4-mini"
    OPENAI_TIMEOUT_SECONDS: float = 30.0
    OPENAI_MAX_OUTPUT_TOKENS: int = 800
    AI_RATE_LIMIT_PER_MINUTE: int = 5
    AI_CONTEXT_MAX_ORDERS: int = 50

    # Background reminders
    ENABLE_REMINDER_SCHEDULER: bool = True
    REMINDER_THRESHOLD_MINUTES: int = 15
    REMINDER_CHECK_INTERVAL_SECONDS: int = 60

    # Login brute-force protection
    LOGIN_RATE_LIMIT_PER_MINUTE: int = 10

    @field_validator("APP_TIMEZONE")
    @classmethod
    def _valid_timezone(cls, v: str) -> str:
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError(f"Unknown timezone: {v!r} (use an IANA name like 'Asia/Kolkata')")
        return v

    @field_validator("OPENAI_API_KEY")
    @classmethod
    def _blank_key_is_none(cls, v: str | None) -> str | None:
        return v.strip() or None if v else None

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
