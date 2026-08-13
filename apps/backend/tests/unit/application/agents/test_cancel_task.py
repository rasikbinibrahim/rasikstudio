from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.agents.running_tasks import running_tasks
from app.application.agents.cancel_task import CancelAgentTaskRequest, CancelAgentTaskUseCase
from app.core.errors import AgentError
from app.domain.models.agent import AgentTask


class FakeRedis:
    """Same minimal in-memory subset `tests/unit/agents/conftest.py`'s `FakeRedis` implements —
    duplicated here rather than imported, matching this codebase's established per-file
    `FakeRedis` pattern (see e.g. `tests/unit/application/chat/test_send_message.py`)."""

    def __init__(self) -> None:
        self._store: dict[str, str] = {}
        self._lists: dict[str, list[str]] = {}

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self._store[key] = value

    async def exists(self, key: str) -> int:
        return 1 if key in self._store else 0

    async def expire(self, key: str, seconds: int) -> bool:
        return key in self._store or key in self._lists

    async def delete(self, *keys: str) -> int:
        count = 0
        for key in keys:
            if self._store.pop(key, None) is not None:
                count += 1
            if self._lists.pop(key, None) is not None:
                count += 1
        return count

    async def rpush(self, key: str, value: str) -> int:
        self._lists.setdefault(key, []).append(value)
        return len(self._lists[key])


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
        redis = FakeRedis()
        await running_tasks.start(task_id, redis)
        try:
            await CancelAgentTaskUseCase(FakeRepo(task), redis).execute(
                CancelAgentTaskRequest(task_id=task_id, user_id=user_id)
            )
            assert await running_tasks.is_cancelled(task_id, redis)
        finally:
            await running_tasks.finish(task_id, redis)

    async def test_raises_for_a_nonexistent_task(self) -> None:
        with pytest.raises(AgentError):
            await CancelAgentTaskUseCase(FakeRepo(_task(uuid4(), uuid4())), FakeRedis()).execute(
                CancelAgentTaskRequest(task_id=uuid4(), user_id=uuid4())
            )

    async def test_raises_for_a_task_owned_by_another_user(self) -> None:
        task_id = uuid4()
        task = _task(task_id, user_id=uuid4())
        with pytest.raises(AgentError):
            await CancelAgentTaskUseCase(FakeRepo(task), FakeRedis()).execute(
                CancelAgentTaskRequest(task_id=task_id, user_id=uuid4())
            )

    @pytest.mark.parametrize("status", ["completed", "failed", "cancelled"])
    async def test_raises_when_the_task_is_already_finished(self, status: str) -> None:
        task_id, user_id = uuid4(), uuid4()
        task = _task(task_id, user_id, status=status)
        with pytest.raises(AgentError, match="already"):
            await CancelAgentTaskUseCase(FakeRepo(task), FakeRedis()).execute(
                CancelAgentTaskRequest(task_id=task_id, user_id=user_id)
            )

    async def test_raises_when_the_task_is_not_actively_running_in_this_process(self) -> None:
        task_id, user_id = uuid4(), uuid4()
        task = _task(task_id, user_id, status="running")
        with pytest.raises(AgentError, match="not actively running"):
            await CancelAgentTaskUseCase(FakeRepo(task), FakeRedis()).execute(
                CancelAgentTaskRequest(task_id=task_id, user_id=user_id)
            )
