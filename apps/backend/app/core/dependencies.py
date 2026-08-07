from typing import Annotated
from uuid import UUID

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.errors import AuthError
from app.core.middleware.auth import decode_bearer_token
from app.domain.models.user import User
from app.infrastructure.ai.embedding_service import EmbeddingService
from app.infrastructure.ai.model_router import ModelRouter, load_fallback_chains
from app.infrastructure.ai.providers import ai_providers
from app.infrastructure.cache.redis_client import get_redis
from app.infrastructure.db.repositories.user_repository import UserRepository
from app.infrastructure.db.session import get_db

SettingsDep = Annotated[Settings, Depends(get_settings)]
DbDep = Annotated[AsyncSession, Depends(get_db)]
RedisDep = Annotated[Redis, Depends(get_redis)]

# `auto_error=False`: a missing/malformed Authorization header should surface as our own
# AuthError(401, code="missing_token") with the standard error schema, not FastAPI/Starlette's
# default 403 with a bare {"detail": ...} body.
_bearer_scheme = HTTPBearer(auto_error=False)
BearerCredentialsDep = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)]


async def resolve_user_from_token(token: str, settings: Settings, db: AsyncSession) -> User:
    """Raises `AuthError` (with a specific `code`, e.g. `token_expired`) if the token itself is
    invalid, or `AuthError(code="invalid_token")` if the token is valid but no matching active
    user exists — never returns `None`. Callers that want a soft-fail (`get_optional_user`,
    `api/ws/gateway.py`'s first-message auth) catch `AuthError` themselves rather than this
    function swallowing it, so the specific failure reason isn't lost for callers that do care
    (`get_current_user`'s `token_expired` acceptance criterion). Lives here rather than in
    `core/middleware/auth.py` because it needs `UserRepository` (infrastructure); `app/README.md`'s
    Layer Rules document this file as the one exception, specifically so call sites elsewhere
    (the WS gateway included) don't each need their own infrastructure import to do this lookup."""
    payload = decode_bearer_token(token, settings)
    user = await UserRepository(db).get_by_id(UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise AuthError("User not found or inactive", code="invalid_token")
    return user


async def get_current_user(credentials: BearerCredentialsDep, settings: SettingsDep, db: DbDep) -> User:
    if credentials is None:
        raise AuthError("Missing bearer token", code="missing_token")
    return await resolve_user_from_token(credentials.credentials, settings, db)


async def get_optional_user(
    credentials: BearerCredentialsDep, settings: SettingsDep, db: DbDep
) -> User | None:
    if credentials is None:
        return None
    try:
        return await resolve_user_from_token(credentials.credentials, settings, db)
    except AuthError:
        return None


CurrentUserDep = Annotated[User, Depends(get_current_user)]
OptionalUserDep = Annotated[User | None, Depends(get_optional_user)]


def get_model_router(settings: SettingsDep, redis: RedisDep) -> ModelRouter:
    return ModelRouter(
        ai_providers,
        load_fallback_chains(settings.fallback_chains_path),
        redis,
        settings.ai_response_cache_ttl_seconds,
    )


def get_embedding_service(settings: SettingsDep) -> EmbeddingService:
    return EmbeddingService(ai_providers, load_fallback_chains(settings.fallback_chains_path))


ModelRouterDep = Annotated[ModelRouter, Depends(get_model_router)]
EmbeddingServiceDep = Annotated[EmbeddingService, Depends(get_embedding_service)]
