from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.agents.running_tasks import ApprovalGate, running_tasks
from app.application.agents.approve_step import ApproveAgentStepRequest, ApproveAgentStepUseCase
from app.core.errors import AgentError
from app.domain.models.agent import AgentTask


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


class TestApproveAgentStepUseCase:
    async def test_resolves_the_gate_a_paused_task_is_waiting_on(self) -> None:
        task_id, user_id = uuid4(), uuid4()
        task = _task(task_id, user_id)
        handle = running_tasks.start(task_id)
        handle.approval_gate = ApprovalGate()
        try:
            await ApproveAgentStepUseCase(FakeRepo(task)).execute(
                ApproveAgentStepRequest(task_id=task_id, user_id=user_id, approved=True)
            )
            assert await handle.approval_gate.wait() is True
        finally:
            running_tasks.finish(task_id)

    async def test_raises_for_a_task_that_does_not_exist(self) -> None:
        with pytest.raises(AgentError):
            await ApproveAgentStepUseCase(FakeRepo(_task(uuid4(), uuid4()))).execute(
                ApproveAgentStepRequest(task_id=uuid4(), user_id=uuid4(), approved=True)
            )

    async def test_raises_for_a_task_owned_by_another_user(self) -> None:
        task_id = uuid4()
        task = _task(task_id, user_id=uuid4())
        with pytest.raises(AgentError):
            await ApproveAgentStepUseCase(FakeRepo(task)).execute(
                ApproveAgentStepRequest(task_id=task_id, user_id=uuid4(), approved=True)
            )

    async def test_raises_when_the_task_is_not_paused(self) -> None:
        task_id, user_id = uuid4(), uuid4()
        task = _task(task_id, user_id, status="running")
        with pytest.raises(AgentError, match="not awaiting approval"):
            await ApproveAgentStepUseCase(FakeRepo(task)).execute(
                ApproveAgentStepRequest(task_id=task_id, user_id=user_id, approved=True)
            )

    async def test_raises_when_the_task_is_not_actively_running_in_this_process(self) -> None:
        task_id, user_id = uuid4(), uuid4()
        task = _task(task_id, user_id, status="paused")
        with pytest.raises(AgentError, match="not actively running"):
            await ApproveAgentStepUseCase(FakeRepo(task)).execute(
                ApproveAgentStepRequest(task_id=task_id, user_id=user_id, approved=True)
            )
