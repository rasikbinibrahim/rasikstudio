from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

import structlog

from app.agents.agent_factory import execute_agent_task
from app.core.background import fire_and_forget
from app.domain.models.agent import AgentTask
from app.domain.ports.agent_repository import AgentRepository

logger = structlog.get_logger("application.agents.run_task")


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
    """Creates the `AgentTask` row (status `pending`) and hands execution off to an
    `asyncio.create_task()` — see `AGENT_FRAMEWORK.md` §10's implementation note for why this is
    an in-process background task rather than a Celery job. `execute()` returns as soon as the
    row exists; it does not wait for the agent to finish."""

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

        fire_and_forget(self._run_in_background(created.id, request))

        return created

    async def _run_in_background(self, task_id: UUID, request: RunAgentTaskRequest) -> None:
        try:
            await execute_agent_task(
                agent_type=request.agent_type,
                task_id=task_id,
                workspace_id=request.workspace_id,
                workspace_root=request.workspace_root,
                user_id=request.user_id,
                model=request.model,
                description=request.description,
                require_approval=request.require_approval,
            )
        except Exception:
            logger.exception("agent_task_background_run_failed", task_id=str(task_id))
