from __future__ import annotations

from typing import Protocol
from uuid import UUID

from app.domain.models.audit import AgentAuditLogEntry


class AuditRepository(Protocol):
    """INSERT-only by design — there is deliberately no `update`/`delete` method on this
    Protocol, since `agent_audit_log` must never be mutated once written."""

    async def record(self, entry: AgentAuditLogEntry) -> AgentAuditLogEntry: ...

    async def list_for_task(self, task_id: UUID) -> list[AgentAuditLogEntry]: ...
