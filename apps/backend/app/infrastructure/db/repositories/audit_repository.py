from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models.audit import AgentAuditLogEntry
from app.infrastructure.db.models.audit import AgentAuditLogModel


class AuditRepository:
    """Implements `domain/ports/audit_repository.py`'s `AuditRepository` Protocol. Not a
    `BaseRepository[ModelT]` subclass like the other repositories — that base class's `get`/
    `update`/`remove` methods would invite mutating an INSERT-only table, so this repository
    only ever exposes `record`/`list_for_task`."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def record(self, entry: AgentAuditLogEntry) -> AgentAuditLogEntry:
        instance = AgentAuditLogModel(
            id=entry.id,
            task_id=entry.task_id,
            step_id=entry.step_id,
            tool=entry.tool,
            action=entry.action,
            approved=entry.approved,
            before_hash=entry.before_hash,
            after_hash=entry.after_hash,
        )
        self._session.add(instance)
        await self._session.flush()
        await self._session.refresh(instance)
        return instance.to_domain()

    async def list_for_task(self, task_id: UUID) -> list[AgentAuditLogEntry]:
        result = await self._session.execute(
            select(AgentAuditLogModel)
            .where(AgentAuditLogModel.task_id == task_id)
            .order_by(AgentAuditLogModel.created_at.asc())
        )
        return [row.to_domain() for row in result.scalars()]
