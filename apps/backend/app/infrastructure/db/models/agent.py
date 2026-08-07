from __future__ import annotations

from datetime import datetime
from typing import Any, cast
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.models.agent import AgentStepStatus, AgentTask, AgentTaskStatus, AgentTaskStep
from app.infrastructure.db.models.base import Base, TimestampMixin


class AgentTaskModel(Base, TimestampMixin):
    __tablename__ = "agent_tasks"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')",
            name="ck_agent_tasks_status",
        ),
        Index("idx_agent_tasks_workspace", "workspace_id", "created_at"),
        Index(
            "idx_agent_tasks_status",
            "status",
            postgresql_where="status IN ('pending', 'running', 'paused')",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    session_id: Mapped[UUID | None] = mapped_column(ForeignKey("chat_sessions.id", ondelete="SET NULL"))
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default="pending")
    plan: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    result: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(String)
    started_at: Mapped[datetime | None] = mapped_column()
    finished_at: Mapped[datetime | None] = mapped_column()

    def to_domain(self) -> AgentTask:
        return AgentTask(
            id=self.id,
            workspace_id=self.workspace_id,
            session_id=self.session_id,
            user_id=self.user_id,
            description=self.description,
            status=cast(AgentTaskStatus, self.status),
            plan=self.plan,
            result=self.result,
            error=self.error,
            model=self.model,
            started_at=self.started_at,
            finished_at=self.finished_at,
            created_at=self.created_at,
            updated_at=self.updated_at,
        )


class AgentTaskStepModel(Base):
    __tablename__ = "agent_task_steps"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'running', 'completed', 'failed')", name="ck_agent_task_steps_status"
        ),
        UniqueConstraint("task_id", "index", name="uq_agent_task_steps_task_index"),
        Index("idx_agent_task_steps_task", "task_id", "index"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    task_id: Mapped[UUID] = mapped_column(ForeignKey("agent_tasks.id", ondelete="CASCADE"))
    index: Mapped[int] = mapped_column(Integer)
    tool: Mapped[str] = mapped_column(String)
    args: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    result: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default="pending")
    started_at: Mapped[datetime | None] = mapped_column()
    finished_at: Mapped[datetime | None] = mapped_column()

    def to_domain(self) -> AgentTaskStep:
        return AgentTaskStep(
            id=self.id,
            task_id=self.task_id,
            index=self.index,
            tool=self.tool,
            args=self.args,
            result=self.result,
            status=cast(AgentStepStatus, self.status),
            started_at=self.started_at,
            finished_at=self.finished_at,
        )
