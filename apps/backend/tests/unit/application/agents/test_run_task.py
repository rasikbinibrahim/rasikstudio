from __future__ import annotations

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


class FakeCeleryTask:
    """Stands in for `run_agent_task` (the real Celery task object) — records `.delay()` calls
    instead of actually dispatching to a broker, the same "inject at the boundary, keep everything
    else real" approach used for `ModelRouter` in `tests/integration/agents/test_agent_execution.py`.
    A real end-to-end dispatch (task queued on a real Redis broker, a real worker process picking
    it up and running `execute_agent_task`) is exercised by
    `tests/integration/agents/test_agent_execution.py`'s Celery-specific tests instead — this unit
    test only needs to verify `RunAgentTaskUseCase` calls `.delay()` with the right, JSON-safe
    arguments."""

    def __init__(self) -> None:
        self.delay_calls: list[dict] = []

    def delay(self, **kwargs) -> None:
        self.delay_calls.append(kwargs)


class TestRunAgentTaskUseCase:
    async def test_creates_a_pending_task_and_dispatches_to_celery(self, monkeypatch) -> None:
        fake_task = FakeCeleryTask()
        monkeypatch.setattr(run_task_module, "run_agent_task", fake_task)
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
        assert len(fake_task.delay_calls) == 1

    async def test_dispatch_receives_every_request_field_as_a_json_safe_string(self, monkeypatch) -> None:
        fake_task = FakeCeleryTask()
        monkeypatch.setattr(run_task_module, "run_agent_task", fake_task)
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

        received = fake_task.delay_calls[0]
        assert received["task_id"] == str(task.id)
        assert received["agent_type"] == "tester"
        assert received["workspace_id"] == str(request.workspace_id)
        assert received["workspace_root"] == str(request.workspace_root)
        assert received["model"] == "claude-sonnet-4-5"
        assert received["require_approval"] is False
        # Celery's JSON transport can't carry `UUID`/`Path` objects — every id/path argument must
        # already be a plain `str` by the time it reaches `.delay()`.
        assert all(
            isinstance(v, str) for k, v in received.items() if k not in ("require_approval",)
        )
