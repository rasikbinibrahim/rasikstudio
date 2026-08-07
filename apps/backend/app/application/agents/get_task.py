from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.core.errors import AgentError
from app.domain.models.agent import AgentTask, AgentTaskStep
from app.domain.ports.agent_repository import AgentRepository


@dataclass(frozen=True, slots=True)
class AgentTaskWithSteps:
    task: AgentTask
    steps: list[AgentTaskStep]


class GetAgentTaskUseCase:
    def __init__(self, agent_repo: AgentRepository) -> None:
        self._agent_repo = agent_repo

    async def execute(self, task_id: UUID, user_id: UUID) -> AgentTaskWithSteps:
        task = await self._agent_repo.get_task(task_id)
        if task is None or task.user_id != user_id:
            raise AgentError("Agent task not found", code="agent_task_not_found")
        steps = await self._agent_repo.list_steps(task_id)
        return AgentTaskWithSteps(task=task, steps=steps)


class ListAgentTasksUseCase:
    def __init__(self, agent_repo: AgentRepository) -> None:
        self._agent_repo = agent_repo

    async def execute(self, workspace_id: UUID) -> list[AgentTask]:
        return await self._agent_repo.list_tasks(workspace_id)
