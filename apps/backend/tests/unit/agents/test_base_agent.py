from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from uuid import uuid4

from app.agents import base_agent as base_agent_module
from app.agents.base_agent import BaseAgent
from app.agents.running_tasks import running_tasks
from app.agents.tools.file_tools import FILE_TOOLS
from app.agents.tools.interaction_tools import INTERACTION_TOOLS
from app.agents.tools.registry import ToolRegistry
from app.domain.ports.ai_provider import CompletionResult, TokenUsage, ToolCall


class FakeAgentRepo:
    def __init__(self) -> None:
        self.steps: list = []
        self.statuses: list[str] = []

    async def append_step(self, step):
        self.steps.append(step)
        return step

    async def update_step(self, step):
        for i, existing in enumerate(self.steps):
            if existing.id == step.id:
                self.steps[i] = step
        return step

    async def update_status(self, task_id, status):
        self.statuses.append(status)

    async def create_task(self, task):
        return task

    async def get_task(self, task_id):
        return None

    async def list_tasks(self, workspace_id):
        return []

    async def list_steps(self, task_id):
        return self.steps


class FakeAuditRepo:
    def __init__(self) -> None:
        self.entries: list = []

    async def record(self, entry):
        self.entries.append(entry)
        return entry

    async def list_for_task(self, task_id):
        return self.entries


@dataclass
class ScriptedRouter:
    """Returns each `responses` entry in order, one per `complete()` call."""

    responses: list[CompletionResult]
    calls: list[dict] = field(default_factory=list)

    async def complete(self, messages, model, temperature=0.7, max_tokens=4096, tools=None):
        self.calls.append({"messages": list(messages), "model": model})
        return self.responses[len(self.calls) - 1]

    async def stream(self, *a, **k) -> AsyncIterator:
        raise NotImplementedError


def _tool_call(name: str, args: dict, call_id: str = "1") -> ToolCall:
    return ToolCall(id=call_id, name=name, arguments=args)


def _result(*, tool_calls=None, content=None, tokens=10) -> CompletionResult:
    return CompletionResult(
        content=content,
        tool_calls=tool_calls,
        finish_reason="tool_calls" if tool_calls else "stop",
        usage=TokenUsage(tokens, tokens, tokens * 2),
    )


def _agent(router, tools, repo, audit_repo, ctx) -> BaseAgent:
    return BaseAgent(model_router=router, tools=tools, agent_repo=repo, audit_repo=audit_repo, context=ctx)


class TestReActLoop:
    async def test_completes_when_the_model_returns_no_tool_calls(self, tmp_path, make_context) -> None:
        router = ScriptedRouter([_result(content="all done")])
        ctx = make_context(tmp_path, require_approval=False)
        agent = _agent(router, ToolRegistry(FILE_TOOLS), FakeAgentRepo(), FakeAuditRepo(), ctx)

        result = await agent.run("do nothing")

        assert result.status == "completed"
        assert result.summary == "all done"

    async def test_executes_a_tool_call_and_feeds_the_result_back(self, tmp_path, make_context) -> None:
        router = ScriptedRouter(
            [
                _result(tool_calls=[_tool_call("write_file", {"path": "a.txt", "content": "hi"})]),
                _result(content="wrote it"),
            ]
        )
        ctx = make_context(tmp_path, require_approval=False)
        repo = FakeAgentRepo()
        agent = _agent(router, ToolRegistry(FILE_TOOLS), repo, FakeAuditRepo(), ctx)

        result = await agent.run("write a file")

        assert result.status == "completed"
        assert (tmp_path / "a.txt").read_text() == "hi"
        assert [s.tool for s in repo.steps] == ["write_file"]
        # The second `complete()` call's messages include the tool's observation.
        second_call_messages = router.calls[1]["messages"]
        assert any(m.role == "tool" and "Wrote" in (m.content or "") for m in second_call_messages)

    async def test_state_machine_pending_to_running_to_completed(self, tmp_path, make_context) -> None:
        router = ScriptedRouter([_result(content="done")])
        ctx = make_context(tmp_path, require_approval=False)
        repo = FakeAgentRepo()
        agent = _agent(router, ToolRegistry(FILE_TOOLS), repo, FakeAuditRepo(), ctx)

        await agent.run("task")

        assert repo.statuses == ["running", "completed"]


class TestGuards:
    async def test_max_iterations_exceeded_fails(self, tmp_path, make_context) -> None:
        # Every call returns a tool call that never satisfies the model, forcing the loop to run
        # until the iteration guard trips.
        responses = [
            _result(tool_calls=[_tool_call("read_file", {"path": "a.txt"}, call_id=str(i))])
            for i in range(base_agent_module.MAX_ITERATIONS + 1)
        ]
        router = ScriptedRouter(responses)
        ctx = make_context(tmp_path, require_approval=False)
        agent = _agent(router, ToolRegistry(FILE_TOOLS), FakeAgentRepo(), FakeAuditRepo(), ctx)

        result = await agent.run("loop forever")

        assert result.status == "failed"
        assert "iterations" in (result.error or "")

    async def test_max_file_writes_exceeded_fails(self, tmp_path, make_context, monkeypatch) -> None:
        monkeypatch.setattr(base_agent_module, "MAX_FILE_WRITES", 2)
        responses = [
            _result(tool_calls=[_tool_call("write_file", {"path": f"{i}.txt", "content": "x"}, str(i))])
            for i in range(5)
        ]
        router = ScriptedRouter(responses)
        ctx = make_context(tmp_path, require_approval=False)
        agent = _agent(router, ToolRegistry(FILE_TOOLS), FakeAgentRepo(), FakeAuditRepo(), ctx)

        result = await agent.run("write many files")

        assert result.status == "failed"
        assert "file writes" in (result.error or "")

    async def test_max_shell_commands_exceeded_fails(self, tmp_path, make_context, monkeypatch) -> None:
        monkeypatch.setattr(base_agent_module, "MAX_SHELL_COMMANDS", 1)
        from app.agents.tools.shell_tools import SHELL_TOOLS

        responses = [
            _result(tool_calls=[_tool_call("run_command", {"command": "echo hi"}, str(i))])
            for i in range(5)
        ]
        router = ScriptedRouter(responses)
        ctx = make_context(tmp_path, require_approval=False)
        agent = _agent(router, ToolRegistry(SHELL_TOOLS), FakeAgentRepo(), FakeAuditRepo(), ctx)

        result = await agent.run("run many commands")

        assert result.status == "failed"
        assert "shell commands" in (result.error or "")

    async def test_max_tokens_exceeded_fails(self, tmp_path, make_context, monkeypatch) -> None:
        monkeypatch.setattr(base_agent_module, "MAX_TOKENS", 100)
        router = ScriptedRouter([_result(content="done", tokens=1000)])
        ctx = make_context(tmp_path, require_approval=False)
        agent = _agent(router, ToolRegistry(FILE_TOOLS), FakeAgentRepo(), FakeAuditRepo(), ctx)

        result = await agent.run("task")

        assert result.status == "failed"
        assert "token" in (result.error or "")

    async def test_timeout_exceeded_fails(self, tmp_path, make_context, monkeypatch) -> None:
        monkeypatch.setattr(base_agent_module, "TASK_TIMEOUT_SECONDS", -1)
        router = ScriptedRouter([_result(content="done")])
        ctx = make_context(tmp_path, require_approval=False)
        agent = _agent(router, ToolRegistry(FILE_TOOLS), FakeAgentRepo(), FakeAuditRepo(), ctx)

        result = await agent.run("task")

        assert result.status == "failed"
        assert "timeout" in (result.error or "")


class TestApprovalGate:
    async def test_high_risk_tool_pauses_and_resumes_on_approval(self, tmp_path, make_context) -> None:
        router = ScriptedRouter(
            [
                _result(tool_calls=[_tool_call("write_file", {"path": "a.txt", "content": "hi"})]),
                _result(content="done"),
            ]
        )
        ctx = make_context(tmp_path, require_approval=True)
        repo = FakeAgentRepo()
        agent = _agent(router, ToolRegistry(FILE_TOOLS), repo, FakeAuditRepo(), ctx)
        await running_tasks.start(ctx.task_id, ctx.redis)

        async def approve_soon():
            await asyncio.sleep(0.05)
            await running_tasks.resolve_approval(ctx.task_id, True, ctx.redis)

        asyncio.create_task(approve_soon())
        result = await agent.run("write a file")
        await running_tasks.finish(ctx.task_id, ctx.redis)

        assert result.status == "completed"
        assert "paused" in repo.statuses
        assert (tmp_path / "a.txt").exists()

    async def test_high_risk_tool_denied_does_not_execute_and_loop_continues(
        self, tmp_path, make_context
    ) -> None:
        router = ScriptedRouter(
            [
                _result(tool_calls=[_tool_call("write_file", {"path": "a.txt", "content": "hi"})]),
                _result(content="ok, I will not write it"),
            ]
        )
        ctx = make_context(tmp_path, require_approval=True)
        agent = _agent(router, ToolRegistry(FILE_TOOLS), FakeAgentRepo(), FakeAuditRepo(), ctx)
        await running_tasks.start(ctx.task_id, ctx.redis)

        async def deny_soon():
            await asyncio.sleep(0.05)
            await running_tasks.resolve_approval(ctx.task_id, False, ctx.redis)

        asyncio.create_task(deny_soon())
        result = await agent.run("write a file")
        await running_tasks.finish(ctx.task_id, ctx.redis)

        assert result.status == "completed"
        assert not (tmp_path / "a.txt").exists()
        denial_messages = [m for m in router.calls[1]["messages"] if m.content == "Action denied by user"]
        assert len(denial_messages) == 1

    async def test_a_denial_reason_is_folded_into_the_tool_observation(self, tmp_path, make_context) -> None:
        router = ScriptedRouter(
            [
                _result(tool_calls=[_tool_call("write_file", {"path": "a.txt", "content": "hi"})]),
                _result(content="ok, trying a different file instead"),
            ]
        )
        ctx = make_context(tmp_path, require_approval=True)
        agent = _agent(router, ToolRegistry(FILE_TOOLS), FakeAgentRepo(), FakeAuditRepo(), ctx)
        await running_tasks.start(ctx.task_id, ctx.redis)

        async def deny_with_reason_soon():
            await asyncio.sleep(0.05)
            await running_tasks.resolve_approval(
                ctx.task_id, False, ctx.redis, reason="wrong file, try b.txt instead"
            )

        asyncio.create_task(deny_with_reason_soon())
        await agent.run("write a file")
        await running_tasks.finish(ctx.task_id, ctx.redis)

        denial_messages = [
            m
            for m in router.calls[1]["messages"]
            if m.content == "Action denied by user: wrong file, try b.txt instead"
        ]
        assert len(denial_messages) == 1

    async def test_an_already_approved_action_is_not_gated_again(self, tmp_path, make_context) -> None:
        router = ScriptedRouter(
            [
                _result(tool_calls=[_tool_call("write_file", {"path": "a.txt", "content": "1"}, "1")]),
                _result(tool_calls=[_tool_call("write_file", {"path": "b.txt", "content": "2"}, "2")]),
                _result(content="done"),
            ]
        )
        ctx = make_context(
            tmp_path, require_approval=True, approved_actions={"write_file"}
        )
        agent = _agent(router, ToolRegistry(FILE_TOOLS), FakeAgentRepo(), FakeAuditRepo(), ctx)

        result = await agent.run("write two files")

        assert result.status == "completed"
        assert (tmp_path / "a.txt").exists()
        assert (tmp_path / "b.txt").exists()


class TestFollowupQuestion:
    async def test_pauses_and_resumes_with_the_human_answer_as_the_tool_observation(
        self, tmp_path, make_context
    ) -> None:
        router = ScriptedRouter(
            [
                _result(tool_calls=[_tool_call("ask_followup_question", {"question": "Which file?"})]),
                _result(content="ok, using src/utils.ts"),
            ]
        )
        ctx = make_context(tmp_path, require_approval=False)
        repo = FakeAgentRepo()
        agent = _agent(router, ToolRegistry(INTERACTION_TOOLS), repo, FakeAuditRepo(), ctx)
        await running_tasks.start(ctx.task_id, ctx.redis)

        async def answer_soon():
            await asyncio.sleep(0.05)
            await running_tasks.submit_answer(ctx.task_id, "src/utils.ts", ctx.redis)

        asyncio.create_task(answer_soon())
        result = await agent.run("refactor the util file")
        await running_tasks.finish(ctx.task_id, ctx.redis)

        assert result.status == "completed"
        assert repo.statuses == ["running", "paused", "running", "completed"]
        second_call_messages = router.calls[1]["messages"]
        assert any(m.role == "tool" and m.content == "src/utils.ts" for m in second_call_messages)

    async def test_publishes_a_question_asked_event(self, tmp_path, make_context, fake_redis) -> None:
        router = ScriptedRouter(
            [
                _result(tool_calls=[_tool_call("ask_followup_question", {"question": "Which file?"})]),
                _result(content="ok"),
            ]
        )
        ctx = make_context(tmp_path, require_approval=False)
        agent = _agent(router, ToolRegistry(INTERACTION_TOOLS), FakeAgentRepo(), FakeAuditRepo(), ctx)
        await running_tasks.start(ctx.task_id, ctx.redis)

        async def answer_soon():
            await asyncio.sleep(0.05)
            await running_tasks.submit_answer(ctx.task_id, "src/utils.ts", ctx.redis)

        asyncio.create_task(answer_soon())
        await agent.run("refactor the util file")
        await running_tasks.finish(ctx.task_id, ctx.redis)

        published_types = [json.loads(payload)["type"] for _channel, payload in fake_redis.published]
        assert "agent_question_asked" in published_types

    async def test_cancelling_while_awaiting_an_answer_finishes_as_cancelled(
        self, tmp_path, make_context
    ) -> None:
        router = ScriptedRouter(
            [_result(tool_calls=[_tool_call("ask_followup_question", {"question": "Which file?"})])]
        )
        ctx = make_context(tmp_path, require_approval=False)
        agent = _agent(router, ToolRegistry(INTERACTION_TOOLS), FakeAgentRepo(), FakeAuditRepo(), ctx)
        await running_tasks.start(ctx.task_id, ctx.redis)

        async def cancel_soon():
            await asyncio.sleep(0.05)
            await running_tasks.request_cancel(ctx.task_id, ctx.redis)

        asyncio.create_task(cancel_soon())
        result = await agent.run("refactor the util file")
        await running_tasks.finish(ctx.task_id, ctx.redis)

        assert result.status == "cancelled"


class TestCancellation:
    async def test_cancel_before_first_iteration(self, tmp_path, make_context) -> None:
        router = ScriptedRouter([_result(content="should not be reached")])
        ctx = make_context(tmp_path, require_approval=False)
        agent = _agent(router, ToolRegistry(FILE_TOOLS), FakeAgentRepo(), FakeAuditRepo(), ctx)
        await running_tasks.start(ctx.task_id, ctx.redis)
        await running_tasks.request_cancel(ctx.task_id, ctx.redis)

        result = await agent.run("task")
        await running_tasks.finish(ctx.task_id, ctx.redis)

        assert result.status == "cancelled"
        assert router.calls == []

    async def test_cancelling_an_ancestor_task_stops_a_sub_agent(self, tmp_path, make_context) -> None:
        """A sub-agent spawned via `create_agent` runs inside its orchestrator's own tool call, so
        the orchestrator's loop can't notice its own cancellation until the sub-agent returns —
        the sub-agent has to check its ancestors' cancel state itself (`cancellation_chain`)."""
        router = ScriptedRouter([_result(content="should not be reached")])
        parent_task_id = uuid4()
        ctx = make_context(tmp_path, require_approval=False, cancellation_chain=(parent_task_id,))
        agent = _agent(router, ToolRegistry(FILE_TOOLS), FakeAgentRepo(), FakeAuditRepo(), ctx)
        # Only the ancestor's cancel key is set — this sub-agent's own key never is.
        await running_tasks.start(parent_task_id, ctx.redis)
        await running_tasks.request_cancel(parent_task_id, ctx.redis)

        result = await agent.run("sub-task")
        await running_tasks.finish(parent_task_id, ctx.redis)

        assert result.status == "cancelled"
        assert router.calls == []

    async def test_a_sub_agent_with_no_cancelled_ancestor_runs_normally(self, tmp_path, make_context) -> None:
        router = ScriptedRouter([_result(content="done")])
        parent_task_id = uuid4()
        ctx = make_context(tmp_path, require_approval=False, cancellation_chain=(parent_task_id,))
        agent = _agent(router, ToolRegistry(FILE_TOOLS), FakeAgentRepo(), FakeAuditRepo(), ctx)
        await running_tasks.start(parent_task_id, ctx.redis)

        result = await agent.run("sub-task")
        await running_tasks.finish(parent_task_id, ctx.redis)

        assert result.status == "completed"

    async def test_checking_cancellation_refreshes_every_ancestors_heartbeat_too(
        self, tmp_path, make_context
    ) -> None:
        """Without this, a sub-agent running longer than `_HEARTBEAT_TTL_SECONDS` would let its
        ancestor's heartbeat key expire while blocked waiting on it — making a real, still-running
        orchestrator task look inactive to `POST /agents/{id}/cancel` (`request_cancel()` checks
        `is_active()`, which is heartbeat existence, first)."""
        router = ScriptedRouter([_result(content="done")])
        parent_task_id = uuid4()
        ctx = make_context(tmp_path, require_approval=False, cancellation_chain=(parent_task_id,))
        agent = _agent(router, ToolRegistry(FILE_TOOLS), FakeAgentRepo(), FakeAuditRepo(), ctx)
        await running_tasks.start(parent_task_id, ctx.redis)

        await agent.run("sub-task")

        assert await running_tasks.is_active(parent_task_id, ctx.redis) is True


class TestAuditLog:
    async def test_high_risk_tool_execution_is_audited_with_hashes(self, tmp_path, make_context) -> None:
        router = ScriptedRouter(
            [
                _result(tool_calls=[_tool_call("write_file", {"path": "a.txt", "content": "hi"})]),
                _result(content="done"),
            ]
        )
        ctx = make_context(tmp_path, require_approval=False)
        audit_repo = FakeAuditRepo()
        agent = _agent(router, ToolRegistry(FILE_TOOLS), FakeAgentRepo(), audit_repo, ctx)

        await agent.run("write a file")

        assert len(audit_repo.entries) == 1
        entry = audit_repo.entries[0]
        assert entry.tool == "write_file"
        assert entry.before_hash is None
        assert entry.after_hash is not None

    async def test_low_risk_tool_execution_is_not_audited(self, tmp_path, make_context) -> None:
        (tmp_path / "a.txt").write_text("hi")
        router = ScriptedRouter(
            [
                _result(tool_calls=[_tool_call("read_file", {"path": "a.txt"})]),
                _result(content="done"),
            ]
        )
        ctx = make_context(tmp_path, require_approval=False)
        audit_repo = FakeAuditRepo()
        agent = _agent(router, ToolRegistry(FILE_TOOLS), FakeAgentRepo(), audit_repo, ctx)

        await agent.run("read a file")

        assert audit_repo.entries == []
