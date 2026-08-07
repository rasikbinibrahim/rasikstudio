import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_defaults_are_valid_without_any_env_vars(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in ("APP_ENV", "LOG_LEVEL", "LOG_FORMAT", "DATABASE_URL", "REDIS_URL"):
        monkeypatch.delenv(key, raising=False)

    settings = Settings(_env_file=None)  # type: ignore[call-arg]

    assert settings.app_env == "development"
    assert settings.log_level == "INFO"
    assert settings.database_url.startswith("postgresql+asyncpg://")
    assert settings.redis_url.startswith("redis://")


def test_env_vars_override_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("LOG_FORMAT", "json")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@db:5432/x")
    monkeypatch.setenv("RATE_LIMIT_DEFAULT", "5/second")

    settings = Settings(_env_file=None)  # type: ignore[call-arg]

    assert settings.app_env == "production"
    assert settings.log_format == "json"
    assert settings.database_url == "postgresql+asyncpg://u:p@db:5432/x"
    assert settings.rate_limit_default == "5/second"


def test_invalid_app_env_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "not-a-real-environment")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)  # type: ignore[call-arg]


def test_cors_origins_parses_json_array(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", '["https://a.example", "https://b.example"]')

    settings = Settings(_env_file=None)  # type: ignore[call-arg]

    assert settings.cors_origins == ["https://a.example", "https://b.example"]
