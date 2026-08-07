from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.core.config import Settings
from app.core.security import create_access_token, generate_refresh_token, hash_refresh_token
from app.domain.models.user import User
from app.infrastructure.db.repositories.auth_repository import AuthRepository

# Shared by RegisterUseCase/LoginUseCase/RefreshTokenUseCase/OAuthCallbackUseCase — every one of
# them ends the same way ("this user is now authenticated, issue a token pair"), so the token
# lifecycle (AUTHENTICATION.md §3) lives in one place rather than four.


@dataclass(frozen=True, slots=True)
class TokenPair:
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


async def issue_token_pair(user: User, auth_repo: AuthRepository, settings: Settings) -> TokenPair:
    access_token = create_access_token(user_id=user.id, email=user.email, settings=settings)

    refresh_token = generate_refresh_token()
    await auth_repo.store(
        user_id=user.id,
        token_hash=hash_refresh_token(refresh_token),
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
    )

    return TokenPair(access_token=access_token, refresh_token=refresh_token)
