from __future__ import annotations

from uuid import UUID

from sqlalchemy import select

from app.domain.models.user import User
from app.infrastructure.db.models.user import UserModel
from app.infrastructure.db.repositories.base import BaseRepository


class UserRepository(BaseRepository[UserModel]):
    """Implements `app.domain.ports.user_repository.UserRepository` (structural typing — no
    explicit inheritance needed)."""

    model = UserModel

    async def get_by_id(self, user_id: UUID) -> User | None:
        instance = await self.get(user_id)
        return instance.to_domain() if instance else None

    async def get_by_email(self, email: str) -> User | None:
        result = await self._session.execute(select(UserModel).where(UserModel.email == email))
        instance = result.scalar_one_or_none()
        return instance.to_domain() if instance else None

    async def create(self, user: User) -> User:
        instance = UserModel(
            id=user.id,
            email=user.email,
            name=user.name,
            avatar_url=user.avatar_url,
            auth_provider=user.auth_provider,
            hashed_password=user.hashed_password,
            is_active=user.is_active,
            settings=user.settings,
        )
        await self.add(instance)
        return instance.to_domain()

    async def update(self, user: User) -> User:
        instance = await self.get(user.id)
        if instance is None:
            # Calling update() on a nonexistent id is a caller bug (the use-case layer is
            # responsible for checking existence / producing a real 404 first), not a normal
            # user-facing condition — hence a plain exception rather than a RasikStudioError.
            raise ValueError(f"User {user.id} not found")
        instance.email = user.email
        instance.name = user.name
        instance.avatar_url = user.avatar_url
        instance.hashed_password = user.hashed_password
        instance.is_active = user.is_active
        instance.settings = user.settings
        await self._session.flush()
        # `updated_at` is server-computed (onupdate=func.now()), so the in-memory instance is
        # left "expired" after an UPDATE flush — reading it in to_domain() would otherwise trigger
        # an implicit lazy-load, which isn't safe from a sync method in an async context.
        await self._session.refresh(instance)
        return instance.to_domain()
