from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from redis.asyncio import Redis

from app.api.ws.event_types import (
    AgentApprovalRequiredEvent,
    AgentCompletedEvent,
    AgentFailedEvent,
    AgentStartedEvent,
    AgentStatusChangedEvent,
    AgentStepEvent,
)
from app.api.ws.publisher import publish_event


class EventEmitter:
    """Thin wrapper around `api/ws/publisher.py`'s `publish_event()`, bound to one task's
    workspace/user so agent code doesn't need to thread `workspace_id`/`user_id` through every
    emit call. Agent progress events are user-scoped (`shared=False`, the publisher's default) —
    only the user who launched the task watches its steps, unlike `file_changed`/
    `git_status_changed`, which broadcast workspace-wide."""

    def __init__(self, redis: Redis, *, workspace_id: UUID, user_id: UUID) -> None:
        self._redis = redis
        self._workspace_id = workspace_id
        self._user_id = user_id

    async def started(self, task_id: UUID, description: str) -> None:
        await publish_event(
            self._redis,
            AgentStartedEvent(
                workspace_id=self._workspace_id,
                user_id=self._user_id,
                timestamp=self._now(),
                task_id=task_id,
                description=description,
            ),
        )

    async def step(
        self, task_id: UUID, *, index: int, tool_name: str, args: dict[str, object], result: str | None
    ) -> None:
        await publish_event(
            self._redis,
            AgentStepEvent(
                workspace_id=self._workspace_id,
                user_id=self._user_id,
                timestamp=self._now(),
                task_id=task_id,
                step_index=index,
                tool=tool_name,
                args=args,
                result=result,
            ),
        )

    async def approval_required(self, task_id: UUID, *, action: str, preview: str | None) -> None:
        await publish_event(
            self._redis,
            AgentApprovalRequiredEvent(
                workspace_id=self._workspace_id,
                user_id=self._user_id,
                timestamp=self._now(),
                task_id=task_id,
                action=action,
                preview=preview,
            ),
        )

    async def status_changed(self, task_id: UUID, *, status: str) -> None:
        await publish_event(
            self._redis,
            AgentStatusChangedEvent(
                workspace_id=self._workspace_id,
                user_id=self._user_id,
                timestamp=self._now(),
                task_id=task_id,
                status=status,
            ),
        )

    async def completed(self, task_id: UUID, *, summary: str) -> None:
        await publish_event(
            self._redis,
            AgentCompletedEvent(
                workspace_id=self._workspace_id,
                user_id=self._user_id,
                timestamp=self._now(),
                task_id=task_id,
                summary=summary,
            ),
        )

    async def failed(self, task_id: UUID, *, error: str) -> None:
        await publish_event(
            self._redis,
            AgentFailedEvent(
                workspace_id=self._workspace_id,
                user_id=self._user_id,
                timestamp=self._now(),
                task_id=task_id,
                error=error,
            ),
        )

    @staticmethod
    def _now() -> datetime:
        return datetime.now(UTC)


@dataclass
class AgentContext:
    """Per AGENT_FRAMEWORK.md §5, minus `memory: AgentMemory` — long-term-memory retrieval/
    extraction needs `memory_classifier.py` (`domain/services/README.md`), which isn't in Phase
    8's own Files-to-Create list. Adding it here would mean either a fake no-op `AgentMemory` or
    scope creep into work that belongs to whichever phase actually builds fact extraction; see
    TASKS.md for the follow-up. Every other field is real and used by `BaseAgent`'s loop."""

    task_id: UUID
    workspace_id: UUID
    workspace_root: Path
    user_id: UUID
    model: str
    event_emitter: EventEmitter
    require_approval: bool = True
    approved_actions: set[str] = field(default_factory=set)
