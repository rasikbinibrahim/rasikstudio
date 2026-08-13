from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from redis.asyncio import Redis
from starlette import status

from app.agents.running_tasks import running_tasks
from app.core.errors import AgentError
from app.domain.ports.agent_repository import AgentRepository


@dataclass(frozen=True, slots=True)
class CancelAgentTaskRequest:
    task_id: UUID
    user_id: UUID


class CancelAgentTaskUseCase:
    """Signals a running (or paused-awaiting-approval) task to stop. The task notices at the top
    of its next loop iteration (or immediately, if it was paused — `RunningTaskRegistry.
    request_cancel()` also resolves a pending approval as denied so a paused task doesn't sit
    blocked on a human decision that's now moot); it doesn't stop mid-tool-call."""

    def __init__(self, agent_repo: AgentRepository, redis: Redis) -> None:
        self._agent_repo = agent_repo
        self._redis = redis

    async def execute(self, request: CancelAgentTaskRequest) -> None:
        task = await self._agent_repo.get_task(request.task_id)
        if task is None or task.user_id != request.user_id:
            raise AgentError("Agent task not found", code="agent_task_not_found")
        if task.status in ("completed", "failed", "cancelled"):
            raise AgentError(
                f"Agent task is already '{task.status}'",
                code="agent_task_already_finished",
                status_code=status.HTTP_409_CONFLICT,
            )

        cancelled = await running_tasks.request_cancel(request.task_id, self._redis)
        if not cancelled:
            raise AgentError(
                "Agent task is not actively running in this process",
                code="agent_task_not_active",
                status_code=status.HTTP_409_CONFLICT,
            )
