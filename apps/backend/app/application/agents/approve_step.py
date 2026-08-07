from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from starlette import status

from app.agents.running_tasks import running_tasks
from app.core.errors import AgentError
from app.domain.ports.agent_repository import AgentRepository


@dataclass(frozen=True, slots=True)
class ApproveAgentStepRequest:
    task_id: UUID
    user_id: UUID
    approved: bool


class ApproveAgentStepUseCase:
    """Resolves the `ApprovalGate` a paused task is waiting on (`agents/running_tasks.py`) —
    `BaseAgent._await_approval()` is the other end of this hand-off. Denying doesn't cancel the
    task outright (AGENT_FRAMEWORK.md §6: "Agent may plan an alternative approach"); it just
    fails that one tool call, and the ReAct loop decides what to do next."""

    def __init__(self, agent_repo: AgentRepository) -> None:
        self._agent_repo = agent_repo

    async def execute(self, request: ApproveAgentStepRequest) -> None:
        task = await self._agent_repo.get_task(request.task_id)
        if task is None or task.user_id != request.user_id:
            raise AgentError("Agent task not found", code="agent_task_not_found")
        if task.status != "paused":
            raise AgentError(
                f"Agent task is '{task.status}', not awaiting approval",
                code="agent_task_not_paused",
                status_code=status.HTTP_409_CONFLICT,
            )

        resolved = running_tasks.resolve_approval(request.task_id, request.approved)
        if not resolved:
            raise AgentError(
                "Agent task is not actively running in this process",
                code="agent_task_not_active",
                status_code=status.HTTP_409_CONFLICT,
            )
