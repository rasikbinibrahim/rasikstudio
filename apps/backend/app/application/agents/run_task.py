from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

from app.domain.models.agent import AgentTask
from app.domain.ports.agent_repository import AgentRepository
from app.tasks.agent_tasks import run_agent_task


@dataclass(frozen=True, slots=True)
class RunAgentTaskRequest:
    workspace_id: UUID
    user_id: UUID
    agent_type: str
    description: str
    model: str
    workspace_root: Path
    require_approval: bool = True


class RunAgentTaskUseCase:
    """Creates the `AgentTask` row (status `pending`) and dispatches execution to a Celery worker
    (ADR 0004) via `run_agent_task.delay()` — `execute()` returns as soon as the row exists and
    the task is queued; it does not wait for the agent to finish, run, or even be picked up by a
    worker."""

    def __init__(self, agent_repo: AgentRepository) -> None:
        self._agent_repo = agent_repo

    async def execute(self, request: RunAgentTaskRequest) -> AgentTask:
        now = datetime.now(UTC)
        task = AgentTask(
            id=uuid4(),
            workspace_id=request.workspace_id,
            session_id=None,
            user_id=request.user_id,
            description=request.description,
            status="pending",
            plan=None,
            result=None,
            error=None,
            model=request.model,
            started_at=None,
            finished_at=None,
            created_at=now,
            updated_at=now,
        )
        created = await self._agent_repo.create_task(task)

        # Celery's JSON serializer can't carry `UUID`/`Path` across the broker — every argument
        # is a plain `str`, reconstructed back into its real type inside `run_agent_task` itself.
        run_agent_task.delay(
            task_id=str(created.id),
            workspace_id=str(request.workspace_id),
            workspace_root=str(request.workspace_root),
            user_id=str(request.user_id),
            model=request.model,
            description=request.description,
            agent_type=request.agent_type,
            require_approval=request.require_approval,
        )

        return created
