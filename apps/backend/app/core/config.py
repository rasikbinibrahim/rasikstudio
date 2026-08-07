from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Rasik Studio Backend"
    app_env: Literal["development", "staging", "production"] = "development"

    host: str = "127.0.0.1"
    port: int = 8000

    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    log_format: Literal["json", "console"] = "console"

    cors_origins: list[str] = ["http://localhost:5173"]

    rate_limit_default: str = "100/minute"

    database_url: str = "postgresql+asyncpg://rasik:rasik@localhost:5432/rasik_studio"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_recycle_seconds: int = 3600

    redis_url: str = "redis://localhost:6379/0"

    # Dev-only defaults — every deployment beyond a laptop must override both via env vars.
    # SECRET_KEY signs JWTs; ENCRYPTION_KEY must be exactly 32 bytes (AES-256-GCM key size),
    # validated below rather than discovered as a cryptography exception at first encrypt() call.
    secret_key: str = "dev-only-secret-key-change-in-production"
    encryption_key: str = "dev-only-encryption-key-32bytes!"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    github_client_id: str = ""
    github_client_secret: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    # Base URL this backend is reachable at, used to build the OAuth callback redirect_uri
    # (e.g. "{oauth_redirect_base_url}/api/v1/auth/oauth/github/callback").
    oauth_redirect_base_url: str = "http://localhost:8000"

    # AI providers (Phase 9). Ollama needs no key — it's a local HTTP server. Cloud providers are
    # opt-in: an empty key means that provider's `is_available()` reports False and the model
    # router's fallback chain skips it, rather than the app failing to start.
    ollama_base_url: str = "http://localhost:11434"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    gemini_api_key: str = ""
    ai_response_cache_ttl_seconds: int = 3600
    fallback_chains_path: str = "config/fallback_chains.yaml"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("encryption_key")
    @classmethod
    def _encryption_key_must_be_32_bytes(cls, v: str) -> str:
        if len(v.encode()) != 32:
            raise ValueError(
                f"ENCRYPTION_KEY must be exactly 32 bytes for AES-256-GCM, got {len(v.encode())}"
            )
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
