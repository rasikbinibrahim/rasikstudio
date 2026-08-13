from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.agents.running_tasks import running_tasks
from app.application.agents.answer_question import AnswerAgentQuestionRequest, AnswerAgentQuestionUseCase
from app.core.errors import AgentError
from app.domain.models.agent import AgentTask


class FakeRedis:
    """Same minimal in-memory subset as `test_approve_step.py`'s own `FakeRedis` — duplicated per
    this codebase's established per-file `FakeRedis` pattern rather than shared."""

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

    async def blpop(self, keys: list[str], timeout: int = 0) -> tuple[str, str]:
        key = keys[0]
        return key, self._lists[key].pop(0)


def _task(task_id, user_id, status="paused") -> AgentTask:
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


class TestAnswerAgentQuestionUseCase:
    async def test_resolves_the_hand_off_a_paused_task_is_waiting_on(self) -> None:
        task_id, user_id = uuid4(), uuid4()
        task = _task(task_id, user_id)
        redis = FakeRedis()
        await running_tasks.start(task_id, redis)
        try:
            await AnswerAgentQuestionUseCase(FakeRepo(task), redis).execute(
                AnswerAgentQuestionRequest(task_id=task_id, user_id=user_id, answer="Use src/utils.ts")
            )
            answer = await running_tasks.wait_for_answer(task_id, redis)
            assert answer == "Use src/utils.ts"
        finally:
            await running_tasks.finish(task_id, redis)

    async def test_raises_for_a_task_that_does_not_exist(self) -> None:
        with pytest.raises(AgentError):
            await AnswerAgentQuestionUseCase(FakeRepo(_task(uuid4(), uuid4())), FakeRedis()).execute(
                AnswerAgentQuestionRequest(task_id=uuid4(), user_id=uuid4(), answer="yes")
            )

    async def test_raises_for_a_task_owned_by_another_user(self) -> None:
        task_id = uuid4()
        task = _task(task_id, user_id=uuid4())
        with pytest.raises(AgentError):
            await AnswerAgentQuestionUseCase(FakeRepo(task), FakeRedis()).execute(
                AnswerAgentQuestionRequest(task_id=task_id, user_id=uuid4(), answer="yes")
            )

    async def test_raises_when_the_task_is_not_paused(self) -> None:
        task_id, user_id = uuid4(), uuid4()
        task = _task(task_id, user_id, status="running")
        with pytest.raises(AgentError, match="not awaiting an answer"):
            await AnswerAgentQuestionUseCase(FakeRepo(task), FakeRedis()).execute(
                AnswerAgentQuestionRequest(task_id=task_id, user_id=user_id, answer="yes")
            )

    async def test_raises_when_the_task_is_not_actively_running_in_this_process(self) -> None:
        task_id, user_id = uuid4(), uuid4()
        task = _task(task_id, user_id, status="paused")
        with pytest.raises(AgentError, match="not actively running"):
            await AnswerAgentQuestionUseCase(FakeRepo(task), FakeRedis()).execute(
                AnswerAgentQuestionRequest(task_id=task_id, user_id=user_id, answer="yes")
            )
