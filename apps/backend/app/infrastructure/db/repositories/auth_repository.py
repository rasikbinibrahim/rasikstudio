from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.models.auth import RefreshTokenModel

# No domain dataclass for refresh tokens — per domain/models/README.md's list, only User/
# Workspace/ChatSession/Message/AgentTask/CodeEmbedding/WorkspaceMemory get one. A refresh token
# is pure infrastructure (a hash + expiry + revoked flag checked at the auth boundary, Phase 6),
# never surfaced as a business entity elsewhere, so working directly with the ORM row is enough.


class AuthRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def store(self, *, user_id: UUID, token_hash: str, expires_at: datetime) -> None:
        self._session.add(
            RefreshTokenModel(id=uuid4(), user_id=user_id, token_hash=token_hash, expires_at=expires_at)
        )
        await self._session.flush()

    async def get_by_hash(self, token_hash: str) -> RefreshTokenModel | None:
        result = await self._session.execute(
            select(RefreshTokenModel).where(RefreshTokenModel.token_hash == token_hash)
        )
        return result.scalar_one_or_none()

    async def revoke(self, token_hash: str) -> None:
        # Commits immediately rather than just flushing: RefreshTokenUseCase's rotation path
        # revokes the old token and then either raises (reuse/expiry) or returns a new pair.
        # get_db() rolls back the whole request transaction on an unhandled exception — a
        # revocation is a security event that must stick even when the request that triggered it
        # ultimately reports failure, so it can't wait for the ambient request-scoped commit.
        await self._session.execute(
            update(RefreshTokenModel)
            .where(RefreshTokenModel.token_hash == token_hash)
            .values(revoked=True)
        )
        await self._session.commit()

    async def revoke_all_for_user(self, user_id: UUID) -> None:
        """Called on reuse detection (AUTHENTICATION.md / SECURITY_GUIDELINES.md §5) — presenting
        an already-revoked refresh token implies theft, so every session for that user is killed,
        not just the stolen token. Commits immediately for the same reason as `revoke()`."""
        await self._session.execute(
            update(RefreshTokenModel).where(RefreshTokenModel.user_id == user_id).values(revoked=True)
        )
        await self._session.commit()
