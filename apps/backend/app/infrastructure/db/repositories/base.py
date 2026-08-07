from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.models.base import Base


class BaseRepository[ModelT: Base]:
    """Generic CRUD over one ORM model. Feature repositories compose this for the truly common
    operations (get-by-id, add, remove-an-instance) and add their own domain-specific queries and
    update/delete-by-id methods on top — those vary enough per entity (some ports want an id,
    some want the whole domain object) that forcing one shared signature would fight the Protocol
    each repository actually implements."""

    model: type[ModelT]

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, entity_id: UUID) -> ModelT | None:
        return await self._session.get(self.model, entity_id)

    async def add(self, instance: ModelT) -> ModelT:
        self._session.add(instance)
        await self._session.flush()
        return instance

    async def remove(self, instance: ModelT) -> None:
        await self._session.delete(instance)
        await self._session.flush()
