from __future__ import annotations

from datetime import UTC, datetime

from app.application.auth.token_issuer import TokenPair, issue_token_pair
from app.core.config import Settings
from app.core.errors import AuthError
from app.core.security import hash_refresh_token
from app.domain.ports.user_repository import UserRepository
from app.infrastructure.db.repositories.auth_repository import AuthRepository


class RefreshTokenUseCase:
    def __init__(self, user_repo: UserRepository, auth_repo: AuthRepository, settings: Settings) -> None:
        self._user_repo = user_repo
        self._auth_repo = auth_repo
        self._settings = settings

    async def execute(self, refresh_token: str) -> TokenPair:
        token_hash = hash_refresh_token(refresh_token)
        stored = await self._auth_repo.get_by_hash(token_hash)
        if stored is None:
            raise AuthError("Invalid refresh token")

        if stored.revoked:
            # Reuse detection (AUTHENTICATION.md §3): a revoked token being presented again means
            # it was already rotated away — someone else has a copy. Kill every session for this
            # user, not just this one token, since we can't tell which session is compromised.
            await self._auth_repo.revoke_all_for_user(stored.user_id)
            raise AuthError(
                "Refresh token reuse detected — all sessions revoked", code="token_reuse_detected"
            )

        if stored.expires_at < datetime.now(UTC):
            raise AuthError("Refresh token has expired")

        user = await self._user_repo.get_by_id(stored.user_id)
        if user is None or not user.is_active:
            raise AuthError("User not found or inactive")

        # Rotation: the presented token is dead the moment a new pair is issued from it, whether
        # or not the caller ever uses the new pair.
        await self._auth_repo.revoke(token_hash)

        return await issue_token_pair(user, self._auth_repo, self._settings)
