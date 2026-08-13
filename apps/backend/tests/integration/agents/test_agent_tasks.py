from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.agents import agent_factory as agent_factory_module
from app.domain.models.agent import AgentTask
from app.domain.ports.ai_provider import CompletionResult, TokenUsage
from app.infrastructure.db import session as db_session_module
from app.infrastructure.db.repositories.agent_repository import AgentRepository
from app.tasks.agent_tasks import run_agent_task


@dataclass
class ScriptedRouter:
    responses: list
    calls: list = field(default_factory=list)

    async def complete(self, messages, model, temperature=0.7, max_tokens=4096, tools=None):
        self.calls.append(messages)
        return self.responses[len(self.calls) - 1]


def _done() -> CompletionResult:
    return CompletionResult(content="done", tool_calls=None, finish_reason="stop", usage=TokenUsage(5, 5, 10))


def _patch_infrastructure(monkeypatch, engine, sessionmaker, redis_url: str) -> None:
    """`run_agent_task`'s real production path reads `app.infrastructure.db.session.engine`
    (which it disposes at the top of every call — see its own docstring) and
    `app.agents.agent_factory`'s imported `AsyncSessionLocal` binding (which `execute_agent_task`
    opens sessions from) — both are the *same* engine in production. Pointing both at one
    testcontainer-backed engine here is what makes these tests a real exercise of that dispose-
    then-reconnect behavior, not just of the surrounding wrapper logic."""
    monkeypatch.setattr(agent_factory_module, "AsyncSessionLocal", sessionmaker)
    monkeypatch.setattr(db_session_module, "engine", engine)
    monkeypatch.setattr(agent_factory_module, "ModelRouter", lambda *a, **k: ScriptedRouter([_done()]))
    monkeypatch.setenv("REDIS_URL", redis_url)


class TestRunAgentTaskCelery:
    async def test_the_real_celery_task_runs_execute_agent_task_to_completion(
        self,
        database_url,
        _migrated_schema,
        owned_workspace,
        pending_agent_task,
        db_sessionmaker,
        redis_url,
        monkeypatch,
    ) -> None:
        """Calls the real (not `.delay()`'d) `run_agent_task` — the same synchronous callable a
        `--pool=threads` Celery worker invokes — via `asyncio.to_thread()` so it runs outside this
        test's own already-running event loop, exactly like a real worker thread would. Verifies
        the wrapper's actual job: reconstructing `UUID`/`Path` from the plain strings Celery's
        JSON transport carries, and driving the real `execute_agent_task` to a real, persisted
        completion — not just that a fake gets called with the right args (that's
        `tests/unit/application/agents/test_run_task.py`'s job).

        Verification reads through `db_sessionmaker` — a *separate* engine from the one patched
        into `execute_agent_task`'s path below — deliberately, mirroring production: the API
        process (whose requests would read this row back) and the Celery worker process are
        different OS processes with entirely separate connection pools; nothing in production ever
        shares one engine's pooled connections between the two the way reusing a single engine
        object here would."""
        _, workspace = owned_workspace
        engine = create_async_engine(database_url)
        sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        _patch_infrastructure(monkeypatch, engine, sessionmaker, redis_url)

        await asyncio.to_thread(
            run_agent_task,
            task_id=str(pending_agent_task.id),
            workspace_id=str(workspace.id),
            workspace_root=str(workspace.root_path),
            user_id=str(pending_agent_task.user_id),
            model=pending_agent_task.model,
            description=pending_agent_task.description,
            agent_type="coder",
            require_approval=False,
        )
        await engine.dispose()

        async with db_sessionmaker() as session:
            task_row = await AgentRepository(session).get_task(pending_agent_task.id)
            assert task_row.status == "completed"

    async def test_two_sequential_real_invocations_each_get_a_working_db_session(
        self, database_url, _migrated_schema, owned_workspace, db_sessionmaker, redis_url, monkeypatch
    ) -> None:
        """The specific hazard `agent_tasks.py`'s own docstring names: each call opens its own
        event loop via `asyncio.run()`, and pooled asyncpg connections are bound to the loop that
        opened them — without disposing the shared engine first, the second call's fresh loop
        would try to reuse a connection left open by the first call's (now-closed) loop and raise
        instead of running. Two real, separately created `AgentTask` rows, each run through the
        real task function in its own `asyncio.to_thread()` call, both reaching `completed` is the
        proof the second call doesn't inherit a broken connection from the first."""
        user, workspace = owned_workspace
        engine = create_async_engine(database_url)
        sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        _patch_infrastructure(monkeypatch, engine, sessionmaker, redis_url)

        async def _make_pending_task() -> AgentTask:
            now = datetime.now(UTC)
            async with db_sessionmaker() as session:
                task = await AgentRepository(session).create_task(
                    AgentTask(
                        id=uuid4(),
                        workspace_id=workspace.id,
                        session_id=None,
                        user_id=user.id,
                        description="sequential invocation test",
                        status="pending",
                        plan=None,
                        result=None,
                        error=None,
                        model="gpt-4o-mini",
                        started_at=None,
                        finished_at=None,
                        created_at=now,
                        updated_at=now,
                    )
                )
                await session.commit()
                return task

        task_a = await _make_pending_task()
        task_b = await _make_pending_task()

        for task in (task_a, task_b):
            await asyncio.to_thread(
                run_agent_task,
                task_id=str(task.id),
                workspace_id=str(workspace.id),
                workspace_root=str(workspace.root_path),
                user_id=str(user.id),
                model="gpt-4o-mini",
                description="sequential invocation test",
                agent_type="coder",
                require_approval=False,
            )
        await engine.dispose()

        async with db_sessionmaker() as session:
            repo = AgentRepository(session)
            assert (await repo.get_task(task_a.id)).status == "completed"
            assert (await repo.get_task(task_b.id)).status == "completed"

    async def test_an_infrastructure_level_failure_is_logged_and_re_raised(
        self, database_url, _migrated_schema, owned_workspace, pending_agent_task, redis_url, monkeypatch
    ) -> None:
        """An unknown `agent_type` raises inside `create_agent()` before `BaseAgent.run()` (and
        therefore its own `_finish()`, which persists `failed`/`completed`/`cancelled`) ever gets
        a chance to run — a real failure mode distinct from an agent *deciding* it failed. This is
        the one path `execute_agent_task` can't itself turn into a terminal `AgentTask` status, so
        the wrapper's job is just to not let it vanish silently: log it, and let Celery's own
        result backend see the task as failed too (by re-raising) rather than swallowing it."""
        _, workspace = owned_workspace
        engine = create_async_engine(database_url)
        sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        _patch_infrastructure(monkeypatch, engine, sessionmaker, redis_url)

        with pytest.raises(ValueError, match="Unknown agent type"):
            await asyncio.to_thread(
                run_agent_task,
                task_id=str(pending_agent_task.id),
                workspace_id=str(workspace.id),
                workspace_root=str(workspace.root_path),
                user_id=str(pending_agent_task.user_id),
                model=pending_agent_task.model,
                description=pending_agent_task.description,
                agent_type="not-a-real-agent-type",
                require_approval=False,
            )

        await engine.dispose()
