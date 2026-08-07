from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

AgentTaskStatus = Literal["pending", "running", "paused", "completed", "failed", "cancelled"]
AgentStepStatus = Literal["pending", "running", "completed", "failed"]


@dataclass(frozen=True, slots=True)
class AgentTask:
    """`steps` is intentionally not a field here — per ADR 0009, steps are normalized into their
    own `AgentTaskStep` rows (table `agent_task_steps`) rather than a JSONB array, so callers load
    them separately (e.g. `AgentRepository.list_steps(task_id)`)."""

    id: UUID
    workspace_id: UUID
    session_id: UUID | None
    user_id: UUID
    description: str
    status: AgentTaskStatus
    plan: dict[str, Any] | None
    result: str | None
    error: str | None
    model: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class AgentTaskStep:
    id: UUID
    task_id: UUID
    index: int
    tool: str
    args: dict[str, Any]
    result: str | None
    status: AgentStepStatus
    started_at: datetime | None
    finished_at: datetime | None
