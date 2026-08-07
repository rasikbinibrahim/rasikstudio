from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True, slots=True)
class AgentAuditLogEntry:
    """One row per High-risk tool call a task actually executed (denied calls never run, so they
    never reach this table — only the ones that executed do). INSERT-only: nothing ever updates
    or deletes a row here, per phase-08-agent-framework.md's audit-log acceptance criterion.
    `before_hash`/`after_hash` are `None` for actions that don't touch a single file's content
    (e.g. `run_command`, `create_agent`). `approved` is `True` only when *this specific call*
    went through a fresh approval-gate decision — a later call to an already-`approved_actions`
    tool this task skips the gate (see `BaseAgent`), so its own row records `approved=False`
    even though a human did approve that action type earlier in the same task."""

    id: UUID
    task_id: UUID
    step_id: UUID
    tool: str
    action: str
    approved: bool
    before_hash: str | None
    after_hash: str | None
    created_at: datetime
