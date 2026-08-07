from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import uuid4

from app.application.agents import run_task as run_task_module
from app.application.agents.run_task import RunAgentTaskRequest, RunAgentTaskUseCase


class FakeRepo:
    def __init__(self):
        self.created = []

    async def create_task(self, task):
        self.created.append(task)
        return task


class TestRunAgentTaskUseCase:
    async def test_creates_a_pending_task_and_returns_immediately(self, monkeypatch) -> None:
        started = asyncio.Event()

        async def fake_execute_agent_task(**kwargs):
            started.set()

        monkeypatch.setattr(run_task_module, "execute_agent_task", fake_execute_agent_task)
        repo = FakeRepo()
        request = RunAgentTaskRequest(
            workspace_id=uuid4(),
            user_id=uuid4(),
            agent_type="coder",
            description="fix the bug",
            model="gpt-4o-mini",
            workspace_root=Path("/tmp"),
        )

        task = await RunAgentTaskUseCase(repo).execute(request)

        assert task.status == "pending"
        assert repo.created == [task]
        await asyncio.wait_for(started.wait(), timeout=1)

    async def test_background_run_receives_the_request_fields(self, monkeypatch) -> None:
        received = {}
        done = asyncio.Event()

        async def fake_execute_agent_task(**kwargs):
            received.update(kwargs)
            done.set()

        monkeypatch.setattr(run_task_module, "execute_agent_task", fake_execute_agent_task)
        repo = FakeRepo()
        request = RunAgentTaskRequest(
            workspace_id=uuid4(),
            user_id=uuid4(),
            agent_type="tester",
            description="write tests",
            model="claude-sonnet-4-5",
            workspace_root=Path("/workspace"),
            require_approval=False,
        )

        task = await RunAgentTaskUseCase(repo).execute(request)
        await asyncio.wait_for(done.wait(), timeout=1)

        assert received["task_id"] == task.id
        assert received["agent_type"] == "tester"
        assert received["workspace_id"] == request.workspace_id
        assert received["model"] == "claude-sonnet-4-5"
        assert received["require_approval"] is False

    async def test_a_background_failure_is_logged_not_raised(self, monkeypatch) -> None:
        done = asyncio.Event()

        async def failing_execute_agent_task(**kwargs):
            done.set()
            raise RuntimeError("boom")

        monkeypatch.setattr(run_task_module, "execute_agent_task", failing_execute_agent_task)
        repo = FakeRepo()
        request = RunAgentTaskRequest(
            workspace_id=uuid4(),
            user_id=uuid4(),
            agent_type="coder",
            description="task",
            model="gpt-4o-mini",
            workspace_root=Path("/tmp"),
        )

        task = await RunAgentTaskUseCase(repo).execute(request)  # must not raise
        await asyncio.wait_for(done.wait(), timeout=1)
        assert task.status == "pending"
