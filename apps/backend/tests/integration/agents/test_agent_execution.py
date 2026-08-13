from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from pathlib import Path

import pytest
from redis.asyncio import Redis

from app.agents import agent_factory as agent_factory_module
from app.agents.agent_factory import execute_agent_task
from app.agents.running_tasks import running_tasks
from app.domain.ports.ai_provider import CompletionResult, TokenUsage, ToolCall
from app.infrastructure.db.repositories.agent_repository import AgentRepository
from app.infrastructure.db.repositories.audit_repository import AuditRepository


@dataclass
class ScriptedRouter:
    responses: list[CompletionResult]
    calls: list = field(default_factory=list)

    async def complete(self, messages, model, temperature=0.7, max_tokens=4096, tools=None):
        self.calls.append(messages)
        return self.responses[len(self.calls) - 1]


def _result(*, tool_calls=None, content=None) -> CompletionResult:
    return CompletionResult(
        content=content,
        tool_calls=tool_calls,
        finish_reason="tool_calls" if tool_calls else "stop",
        usage=TokenUsage(5, 5, 10),
    )


def _write_call(path: str, content: str, call_id: str = "1") -> ToolCall:
    return ToolCall(id=call_id, name="write_file", arguments={"path": path, "content": content})


@pytest.fixture(autouse=True)
def _patch_agent_infrastructure(db_sessionmaker, redis_url, monkeypatch):
    """`execute_agent_task()` normally opens its own `AsyncSessionLocal`-backed session and its
    own Redis client from `settings.redis_url` — both redirected to the testcontainers, same
    "env var + settings cache clear" technique `live_server` (Phase 7) uses, plus the direct
    `AsyncSessionLocal` swap since `execute_agent_task` isn't reachable through FastAPI DI."""
    monkeypatch.setattr(agent_factory_module, "AsyncSessionLocal", db_sessionmaker)
    monkeypatch.setenv("REDIS_URL", redis_url)


def _patch_router(monkeypatch, router: ScriptedRouter) -> None:
    """`execute_agent_task()` also builds a real `ModelRouter` (which would try real cloud APIs
    with no key configured here) — redirected to a scripted fake, same "inject at the boundary,
    keep everything else real" approach Phase 9's provider tests used."""
    monkeypatch.setattr(agent_factory_module, "ModelRouter", lambda *a, **k: router)


class TestExecuteAgentTask:
    async def test_persists_steps_and_reaches_completed(
        self, db_sessionmaker, owned_workspace, pending_agent_task, monkeypatch
    ) -> None:
        _, workspace = owned_workspace
        router = ScriptedRouter(
            [_result(tool_calls=[_write_call("a.txt", "hi")]), _result(content="all done")]
        )
        _patch_router(monkeypatch, router)

        result = await execute_agent_task(
            agent_type="coder",
            task_id=pending_agent_task.id,
            workspace_id=workspace.id,
            workspace_root=Path(workspace.root_path),
            user_id=pending_agent_task.user_id,
            model=pending_agent_task.model,
            description=pending_agent_task.description,
            require_approval=False,
        )

        assert result.status == "completed"
        assert (Path(workspace.root_path) / "a.txt").read_text() == "hi"

        async with db_sessionmaker() as session:
            steps = await AgentRepository(session).list_steps(pending_agent_task.id)
            assert [s.tool for s in steps] == ["write_file"]

            task_row = await AgentRepository(session).get_task(pending_agent_task.id)
            assert task_row.status == "completed"

            audit_entries = await AuditRepository(session).list_for_task(pending_agent_task.id)
            assert len(audit_entries) == 1
            assert audit_entries[0].after_hash is not None

    async def test_publishes_events_to_redis(
        self, db_sessionmaker, owned_workspace, pending_agent_task, redis_url, monkeypatch
    ) -> None:
        _, workspace = owned_workspace
        router = ScriptedRouter([_result(content="done")])
        _patch_router(monkeypatch, router)

        redis = Redis.from_url(redis_url, decode_responses=True)
        pubsub = redis.pubsub()
        channel = f"ws:workspace:{workspace.id}:user:{pending_agent_task.user_id}"
        await pubsub.subscribe(channel)
        await pubsub.get_message(timeout=1)  # subscribe confirmation

        await execute_agent_task(
            agent_type="coder",
            task_id=pending_agent_task.id,
            workspace_id=workspace.id,
            workspace_root=Path(workspace.root_path),
            user_id=pending_agent_task.user_id,
            model=pending_agent_task.model,
            description=pending_agent_task.description,
            require_approval=False,
        )

        messages = []
        for _ in range(5):
            msg = await pubsub.get_message(timeout=1)
            if msg and msg["type"] == "message":
                messages.append(msg["data"])

        assert any('"agent_started"' in m for m in messages)
        assert any('"agent_completed"' in m for m in messages)
        await pubsub.aclose()
        await redis.aclose()

    async def test_approval_gate_pauses_and_resumes_with_real_status_persistence(
        self, db_sessionmaker, owned_workspace, pending_agent_task, redis_url, monkeypatch
    ) -> None:
        _, workspace = owned_workspace
        router = ScriptedRouter([_result(tool_calls=[_write_call("a.txt", "hi")]), _result(content="done")])
        _patch_router(monkeypatch, router)

        redis = Redis.from_url(redis_url, decode_responses=True)

        async def approve_soon() -> None:
            await asyncio.sleep(0.2)
            assert await running_tasks.resolve_approval(pending_agent_task.id, True, redis)

        approver = asyncio.create_task(approve_soon())
        result = await execute_agent_task(
            agent_type="coder",
            task_id=pending_agent_task.id,
            workspace_id=workspace.id,
            workspace_root=Path(workspace.root_path),
            user_id=pending_agent_task.user_id,
            model=pending_agent_task.model,
            description=pending_agent_task.description,
            require_approval=True,
        )
        await approver
        await redis.aclose()

        assert result.status == "completed"

    async def test_cancellation_persists_cancelled_status(
        self, db_sessionmaker, owned_workspace, pending_agent_task, redis_url, monkeypatch
    ) -> None:
        _, workspace = owned_workspace
        router = ScriptedRouter([_result(tool_calls=[_write_call("a.txt", "hi", str(i))]) for i in range(5)])
        _patch_router(monkeypatch, router)

        redis = Redis.from_url(redis_url, decode_responses=True)

        async def cancel_soon() -> None:
            await asyncio.sleep(0.2)
            await running_tasks.request_cancel(pending_agent_task.id, redis)

        canceller = asyncio.create_task(cancel_soon())
        result = await execute_agent_task(
            agent_type="coder",
            task_id=pending_agent_task.id,
            workspace_id=workspace.id,
            workspace_root=Path(workspace.root_path),
            user_id=pending_agent_task.user_id,
            model=pending_agent_task.model,
            description=pending_agent_task.description,
            require_approval=True,
        )
        await canceller
        await redis.aclose()

        assert result.status == "cancelled"

        async with db_sessionmaker() as session:
            task_row = await AgentRepository(session).get_task(pending_agent_task.id)
            assert task_row.status == "cancelled"
