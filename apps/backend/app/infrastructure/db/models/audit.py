from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.models.audit import AgentAuditLogEntry
from app.infrastructure.db.models.base import Base


class AgentAuditLogModel(Base):
    """INSERT-only — no repository method ever updates or deletes a row (see
    `domain/ports/audit_repository.py`)."""

    __tablename__ = "agent_audit_log"
    __table_args__ = (Index("idx_agent_audit_log_task", "task_id", "created_at"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    task_id: Mapped[UUID] = mapped_column(ForeignKey("agent_tasks.id", ondelete="CASCADE"))
    step_id: Mapped[UUID] = mapped_column(ForeignKey("agent_task_steps.id", ondelete="CASCADE"))
    tool: Mapped[str] = mapped_column(String)
    action: Mapped[str] = mapped_column(Text)
    approved: Mapped[bool] = mapped_column(Boolean)
    before_hash: Mapped[str | None] = mapped_column(String)
    after_hash: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    def to_domain(self) -> AgentAuditLogEntry:
        return AgentAuditLogEntry(
            id=self.id,
            task_id=self.task_id,
            step_id=self.step_id,
            tool=self.tool,
            action=self.action,
            approved=self.approved,
            before_hash=self.before_hash,
            after_hash=self.after_hash,
            created_at=self.created_at,
        )
