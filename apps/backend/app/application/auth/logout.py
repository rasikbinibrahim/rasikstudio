from __future__ import annotations

from app.core.security import hash_refresh_token
from app.infrastructure.db.repositories.auth_repository import AuthRepository


class LogoutUseCase:
    def __init__(self, auth_repo: AuthRepository) -> None:
        self._auth_repo = auth_repo

    async def execute(self, refresh_token: str) -> None:
        await self._auth_repo.revoke(hash_refresh_token(refresh_token))
