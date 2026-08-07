from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.agents.running_tasks import running_tasks
from app.application.agents.cancel_task import CancelAgentTaskRequest, CancelAgentTaskUseCase
from app.core.errors import AgentError
from app.domain.models.agent import AgentTask


def _task(task_id, user_id, status="running") -> AgentTask:
    now = datetime.now(UTC)
    return AgentTask(
        id=task_id,
        workspace_id=uuid4(),
        session_id=None,
        user_id=user_id,
        description="do something",
        status=status,
        plan=None,
        result=None,
        error=None,
        model="gpt-4o-mini",
        started_at=now,
        finished_at=None,
        created_at=now,
        updated_at=now,
    )


class FakeRepo:
    def __init__(self, task):
        self._task = task

    async def get_task(self, task_id):
        return self._task if task_id == self._task.id else None


class TestCancelAgentTaskUseCase:
    async def test_signals_cancellation_for_a_running_task(self) -> None:
        task_id, user_id = uuid4(), uuid4()
        task = _task(task_id, user_id)
        handle = running_tasks.start(task_id)
        try:
            await CancelAgentTaskUseCase(FakeRepo(task)).execute(
                CancelAgentTaskRequest(task_id=task_id, user_id=user_id)
            )
            assert handle.cancel_event.is_set()
        finally:
            running_tasks.finish(task_id)

    async def test_raises_for_a_nonexistent_task(self) -> None:
        with pytest.raises(AgentError):
            await CancelAgentTaskUseCase(FakeRepo(_task(uuid4(), uuid4()))).execute(
                CancelAgentTaskRequest(task_id=uuid4(), user_id=uuid4())
            )

    async def test_raises_for_a_task_owned_by_another_user(self) -> None:
        task_id = uuid4()
        task = _task(task_id, user_id=uuid4())
        with pytest.raises(AgentError):
            await CancelAgentTaskUseCase(FakeRepo(task)).execute(
                CancelAgentTaskRequest(task_id=task_id, user_id=uuid4())
            )

    @pytest.mark.parametrize("status", ["completed", "failed", "cancelled"])
    async def test_raises_when_the_task_is_already_finished(self, status: str) -> None:
        task_id, user_id = uuid4(), uuid4()
        task = _task(task_id, user_id, status=status)
        with pytest.raises(AgentError, match="already"):
            await CancelAgentTaskUseCase(FakeRepo(task)).execute(
                CancelAgentTaskRequest(task_id=task_id, user_id=user_id)
            )

    async def test_raises_when_the_task_is_not_actively_running_in_this_process(self) -> None:
        task_id, user_id = uuid4(), uuid4()
        task = _task(task_id, user_id, status="running")
        with pytest.raises(AgentError, match="not actively running"):
            await CancelAgentTaskUseCase(FakeRepo(task)).execute(
                CancelAgentTaskRequest(task_id=task_id, user_id=user_id)
            )
