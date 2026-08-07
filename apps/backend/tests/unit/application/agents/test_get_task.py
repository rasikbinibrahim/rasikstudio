from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.application.agents.get_task import GetAgentTaskUseCase, ListAgentTasksUseCase
from app.core.errors import AgentError
from app.domain.models.agent import AgentTask, AgentTaskStep


def _task(task_id, user_id, workspace_id=None) -> AgentTask:
    now = datetime.now(UTC)
    return AgentTask(
        id=task_id,
        workspace_id=workspace_id or uuid4(),
        session_id=None,
        user_id=user_id,
        description="do something",
        status="completed",
        plan=None,
        result="done",
        error=None,
        model="gpt-4o-mini",
        started_at=now,
        finished_at=now,
        created_at=now,
        updated_at=now,
    )


class FakeRepo:
    def __init__(self, task, steps=None, tasks_by_workspace=None):
        self._task = task
        self._steps = steps or []
        self._tasks_by_workspace = tasks_by_workspace or {}

    async def get_task(self, task_id):
        return self._task if self._task and task_id == self._task.id else None

    async def list_steps(self, task_id):
        return self._steps

    async def list_tasks(self, workspace_id):
        return self._tasks_by_workspace.get(workspace_id, [])


class TestGetAgentTaskUseCase:
    async def test_returns_the_task_with_its_steps(self) -> None:
        task_id, user_id = uuid4(), uuid4()
        task = _task(task_id, user_id)
        step = AgentTaskStep(
            id=uuid4(),
            task_id=task_id,
            index=0,
            tool="read_file",
            args={"path": "a.txt"},
            result="hi",
            status="completed",
            started_at=None,
            finished_at=None,
        )
        result = await GetAgentTaskUseCase(FakeRepo(task, steps=[step])).execute(task_id, user_id)
        assert result.task is task
        assert result.steps == [step]

    async def test_raises_for_a_nonexistent_task(self) -> None:
        with pytest.raises(AgentError):
            await GetAgentTaskUseCase(FakeRepo(None)).execute(uuid4(), uuid4())

    async def test_raises_for_a_task_owned_by_another_user(self) -> None:
        task_id = uuid4()
        task = _task(task_id, user_id=uuid4())
        with pytest.raises(AgentError):
            await GetAgentTaskUseCase(FakeRepo(task)).execute(task_id, uuid4())


class TestListAgentTasksUseCase:
    async def test_lists_tasks_for_a_workspace(self) -> None:
        workspace_id = uuid4()
        task = _task(uuid4(), uuid4(), workspace_id=workspace_id)
        repo = FakeRepo(None, tasks_by_workspace={workspace_id: [task]})
        result = await ListAgentTasksUseCase(repo).execute(workspace_id)
        assert result == [task]

    async def test_empty_for_a_workspace_with_no_tasks(self) -> None:
        repo = FakeRepo(None)
        assert await ListAgentTasksUseCase(repo).execute(uuid4()) == []
