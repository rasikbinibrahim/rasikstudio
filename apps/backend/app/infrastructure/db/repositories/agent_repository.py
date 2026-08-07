from __future__ import annotations

from uuid import UUID

from sqlalchemy import select

from app.domain.models.agent import AgentTask, AgentTaskStatus, AgentTaskStep
from app.infrastructure.db.models.agent import AgentTaskModel, AgentTaskStepModel
from app.infrastructure.db.repositories.base import BaseRepository


class AgentRepository(BaseRepository[AgentTaskModel]):
    model = AgentTaskModel

    async def create_task(self, task: AgentTask) -> AgentTask:
        instance = AgentTaskModel(
            id=task.id,
            workspace_id=task.workspace_id,
            session_id=task.session_id,
            user_id=task.user_id,
            description=task.description,
            status=task.status,
            plan=task.plan,
            result=task.result,
            error=task.error,
            model=task.model,
            started_at=task.started_at,
            finished_at=task.finished_at,
        )
        await self.add(instance)
        return instance.to_domain()

    async def get_task(self, task_id: UUID) -> AgentTask | None:
        instance = await self.get(task_id)
        return instance.to_domain() if instance else None

    async def list_tasks(self, workspace_id: UUID) -> list[AgentTask]:
        result = await self._session.execute(
            select(AgentTaskModel)
            .where(AgentTaskModel.workspace_id == workspace_id)
            .order_by(AgentTaskModel.created_at.desc())
        )
        return [row.to_domain() for row in result.scalars()]

    async def update_status(self, task_id: UUID, status: AgentTaskStatus) -> None:
        instance = await self.get(task_id)
        if instance is None:
            raise ValueError(f"AgentTask {task_id} not found")
        instance.status = status
        await self._session.flush()

    async def append_step(self, step: AgentTaskStep) -> AgentTaskStep:
        instance = AgentTaskStepModel(
            id=step.id,
            task_id=step.task_id,
            index=step.index,
            tool=step.tool,
            args=step.args,
            result=step.result,
            status=step.status,
            started_at=step.started_at,
            finished_at=step.finished_at,
        )
        self._session.add(instance)
        await self._session.flush()
        return instance.to_domain()

    async def list_steps(self, task_id: UUID) -> list[AgentTaskStep]:
        result = await self._session.execute(
            select(AgentTaskStepModel)
            .where(AgentTaskStepModel.task_id == task_id)
            .order_by(AgentTaskStepModel.index.asc())
        )
        return [row.to_domain() for row in result.scalars()]

    async def update_step(self, step: AgentTaskStep) -> AgentTaskStep:
        instance = await self._session.get(AgentTaskStepModel, step.id)
        if instance is None:
            raise ValueError(f"AgentTaskStep {step.id} not found")
        instance.result = step.result
        instance.status = step.status
        instance.started_at = step.started_at
        instance.finished_at = step.finished_at
        await self._session.flush()
        return instance.to_domain()
