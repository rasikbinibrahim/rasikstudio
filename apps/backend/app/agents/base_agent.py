from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4

import aiofiles
import aiofiles.os
import structlog

from app.agents.context import AgentContext
from app.agents.running_tasks import ApprovalDecision, running_tasks
from app.agents.tools.registry import RiskLevel, ToolRegistry
from app.domain.models.agent import AgentTaskStatus, AgentTaskStep
from app.domain.models.audit import AgentAuditLogEntry
from app.domain.ports.agent_repository import AgentRepository
from app.domain.ports.ai_provider import Message
from app.domain.ports.audit_repository import AuditRepository
from app.domain.services.path_validator import WorkspacePathError, resolve_workspace_path
from app.infrastructure.ai.model_router import ModelRouter

logger = structlog.get_logger("agents.base_agent")

# Guards, per AGENT_FRAMEWORK.md §11 / phase-08-agent-framework.md's acceptance criteria.
MAX_ITERATIONS = 30
MAX_FILE_WRITES = 50
MAX_SHELL_COMMANDS = 20
MAX_TOKENS = 200_000
TASK_TIMEOUT_SECONDS = 300

# Tool names that count against the file-write / shell-command guards. Not derived from
# `RiskLevel` (write_file is HIGH, patch_file is MEDIUM — the guard cares about *what kind* of
# side effect a tool has, not how risky a single call is).
_FILE_WRITE_TOOLS = {"write_file", "patch_file", "delete_file"}
_SHELL_TOOLS = {"run_command", "run_tests"}
# The `ask_followup_question` tool (`agents/tools/interaction_tools.py`) — its own call already
# blocks on a human response, so the loop wraps it with a `paused`/`running` DB status transition
# the same way `_await_approval` wraps a HIGH-risk tool call, just triggered by name instead of
# risk level since every call to this specific tool needs it, not only some.
_ASK_FOLLOWUP_QUESTION_TOOL = "ask_followup_question"
# High-risk tools whose `path` argument identifies exactly one file to hash before/after, for the
# audit log's `before_hash`/`after_hash` columns. `patch_file` also mutates a file but is
# MEDIUM risk (not gated, not audited) per `file_tools.py`'s risk assignment.
_HASHABLE_FILE_TOOLS = {"write_file", "delete_file"}

_SYSTEM_PROMPT_TEMPLATE = """You are a {agent_type} agent working inside Rasik Studio IDE.
Your workspace is at: {workspace_root}

## Your Task
{task_description}

## Rules
- Use tools to explore before making changes.
- Read files before writing them.
- Prefer targeted edits (patch_file) over full rewrites (write_file).
- Verify changes compile/pass tests before reporting completion.
- If you are unsure, ask the user rather than guessing.
- Never delete files without explicit confirmation.
- When the task is complete, reply with a final summary and do not call any more tools.
"""


@dataclass(frozen=True, slots=True)
class AgentRunResult:
    status: AgentTaskStatus
    summary: str | None = None
    error: str | None = None


class BaseAgent:
    """Runs the ReAct loop (AGENT_FRAMEWORK.md §2): each iteration calls `ModelRouter.complete()`
    with the tool schemas: no `tool_calls` in the response means the model considers the goal met
    (equivalent to the Reflector deciding "done" — a second, separate reflection call would just
    be asking the same model the same question twice), tool_calls mean sequentially executing
    each one, persisting the step, and feeding the result back as the next observation."""

    agent_type: str = "base"
    # Subclasses override this with the subset of `agent_factory.build_tool_pool()`'s tool names
    # they're allowed to call — see each subclass's own docstring for why its particular subset.
    default_tool_names: frozenset[str] = frozenset()

    def __init__(
        self,
        *,
        model_router: ModelRouter,
        tools: ToolRegistry,
        agent_repo: AgentRepository,
        audit_repo: AuditRepository,
        context: AgentContext,
    ) -> None:
        self._router = model_router
        self._tools = tools
        self._repo = agent_repo
        self._audit_repo = audit_repo
        self._context = context

    async def run(self, task_description: str) -> AgentRunResult:
        messages = [
            Message(role="system", content=self._build_system_prompt(task_description)),
            Message(role="user", content=task_description),
        ]
        # State machine per AGENT_FRAMEWORK.md §10: pending -> running -> ... — the task is
        # created as "pending" by whoever calls this (`RunAgentTaskUseCase`/`run_sub_agent`), so
        # this is where it actually enters "running" for the first time.
        await self._repo.update_status(self._context.task_id, "running")
        await self._context.event_emitter.status_changed(self._context.task_id, status="running")
        await self._context.event_emitter.started(self._context.task_id, task_description)

        deadline = time.monotonic() + TASK_TIMEOUT_SECONDS
        step_index = 0
        file_writes = 0
        shell_commands = 0
        tokens_used = 0

        for iteration in range(1, MAX_ITERATIONS + 1):
            if await self._check_cancelled():
                return await self._finish("cancelled", error="Cancelled by user")
            if time.monotonic() > deadline:
                return await self._finish("failed", error=f"Task exceeded {TASK_TIMEOUT_SECONDS}s timeout")

            result = await self._router.complete(
                messages, model=self._context.model, tools=self._tools.as_ai_tools()
            )
            tokens_used += result.usage.total_tokens
            if tokens_used > MAX_TOKENS:
                return await self._finish("failed", error=f"Exceeded {MAX_TOKENS} token budget")

            if not result.tool_calls:
                summary = result.content or "(agent produced no final summary)"
                return await self._finish("completed", summary=summary)

            messages.append(
                Message(role="assistant", content=result.content, tool_calls=result.tool_calls)
            )

            for tool_call in result.tool_calls:
                if await self._check_cancelled():
                    return await self._finish("cancelled", error="Cancelled by user")

                spec = self._tools.get(tool_call.name)
                needs_approval = (
                    self._context.require_approval
                    and spec is not None
                    and spec.risk == RiskLevel.HIGH
                    and tool_call.name not in self._context.approved_actions
                )
                if needs_approval:
                    decision = await self._await_approval(tool_call.name, tool_call.arguments)
                    if not decision.approved:
                        denial = "Action denied by user"
                        if decision.reason:
                            denial += f": {decision.reason}"
                        messages.append(
                            Message(role="tool", content=denial, tool_call_id=tool_call.id)
                        )
                        continue

                if tool_call.name in _FILE_WRITE_TOOLS:
                    file_writes += 1
                    if file_writes > MAX_FILE_WRITES:
                        return await self._finish("failed", error=f"Exceeded {MAX_FILE_WRITES} file writes")
                if tool_call.name in _SHELL_TOOLS:
                    shell_commands += 1
                    if shell_commands > MAX_SHELL_COMMANDS:
                        return await self._finish(
                            "failed", error=f"Exceeded {MAX_SHELL_COMMANDS} shell commands"
                        )

                is_followup_question = tool_call.name == _ASK_FOLLOWUP_QUESTION_TOOL
                if is_followup_question:
                    # The tool itself (`agents/tools/interaction_tools.py`) publishes the
                    # `question_asked` WS event and blocks for the answer via `running_tasks`'
                    # one-shot hand-off; this wraps that call with the same `paused`/`running` DB
                    # status transition `_await_approval` already gives the approval gate, so
                    # `agent_tasks.status` reflects reality if the API process restarts mid-wait.
                    await self._repo.update_status(self._context.task_id, "paused")
                    await self._context.event_emitter.status_changed(
                        self._context.task_id, status="paused"
                    )

                observation = await self._execute_step(
                    step_index,
                    tool_call.name,
                    tool_call.arguments,
                    risk=spec.risk if spec is not None else None,
                    approved_via_gate=needs_approval,
                )

                if is_followup_question:
                    await self._repo.update_status(self._context.task_id, "running")
                    await self._context.event_emitter.status_changed(
                        self._context.task_id, status="running"
                    )

                messages.append(
                    Message(role="tool", content=observation, tool_call_id=tool_call.id)
                )
                step_index += 1

            logger.info("agent_iteration_complete", task_id=str(self._context.task_id), iteration=iteration)

        return await self._finish("failed", error=f"Exceeded {MAX_ITERATIONS} iterations")

    async def _execute_step(
        self,
        index: int,
        tool_name: str,
        arguments: dict[str, object],
        *,
        risk: RiskLevel | None,
        approved_via_gate: bool,
    ) -> str:
        now = datetime.now(UTC)
        step = AgentTaskStep(
            id=uuid4(),
            task_id=self._context.task_id,
            index=index,
            tool=tool_name,
            args=arguments,
            result=None,
            status="running",
            started_at=now,
            finished_at=None,
        )
        await self._repo.append_step(step)
        await self._context.event_emitter.step(
            self._context.task_id, index=index, tool_name=tool_name, args=arguments, result=None
        )

        before_hash = None
        if risk == RiskLevel.HIGH and tool_name in _HASHABLE_FILE_TOOLS:
            before_hash = await self._hash_file(arguments.get("path"))

        observation = await self._tools.execute(tool_name, arguments, context=self._context)

        finished = AgentTaskStep(
            id=step.id,
            task_id=step.task_id,
            index=index,
            tool=tool_name,
            args=arguments,
            result=observation,
            status="failed" if observation.startswith("Error:") else "completed",
            started_at=now,
            finished_at=datetime.now(UTC),
        )
        await self._repo.update_step(finished)
        await self._context.event_emitter.step(
            self._context.task_id, index=index, tool_name=tool_name, args=arguments, result=observation
        )

        if risk == RiskLevel.HIGH:
            after_hash = None
            if tool_name in _HASHABLE_FILE_TOOLS:
                after_hash = await self._hash_file(arguments.get("path"))
            await self._audit_repo.record(
                AgentAuditLogEntry(
                    id=uuid4(),
                    task_id=self._context.task_id,
                    step_id=step.id,
                    tool=tool_name,
                    action=f"{tool_name}({', '.join(f'{k}={v!r}' for k, v in arguments.items())})",
                    approved=approved_via_gate,
                    before_hash=before_hash,
                    after_hash=after_hash,
                    created_at=datetime.now(UTC),
                )
            )

        return observation

    async def _hash_file(self, path: object) -> str | None:
        if not isinstance(path, str):
            return None
        try:
            abs_path = resolve_workspace_path(self._context.workspace_root, path)
        except WorkspacePathError:
            return None
        if not await aiofiles.os.path.isfile(abs_path):
            return None
        async with aiofiles.open(abs_path, "rb") as f:
            content = await f.read()
        return hashlib.sha256(content).hexdigest()

    async def _check_cancelled(self) -> bool:
        """The natural checkpoint for both cancellation and liveness: called at every loop
        boundary in `run()` anyway, so it doubles as this task's heartbeat to
        `RunningTaskRegistry` — a worker that stalls between checkpoints (e.g. hung on a slow LLM
        call) simply stops refreshing the heartbeat, and its `agent:heartbeat:{id}` key expires on
        its own rather than needing a separate periodic-refresh task.

        Also checks (and heartbeats) every ancestor in `AgentContext.cancellation_chain` — a
        sub-agent spawned via `create_agent` runs synchronously inside its orchestrator's own
        `create_agent` tool call, so the orchestrator's loop is blocked and can't notice its own
        cancellation until the sub-agent returns. Without this, cancelling the orchestrator would
        silently do nothing until whatever sub-agent it delegated to finished on its own. Ancestor
        heartbeats are refreshed here too, not just checked — otherwise a sub-agent running longer
        than `_HEARTBEAT_TTL_SECONDS` would let its ancestor's heartbeat key expire while blocked
        waiting on this very sub-agent, making a real, still-running task look inactive to
        `POST /agents/{id}/cancel`."""
        await running_tasks.heartbeat(self._context.task_id, self._context.redis)
        if await running_tasks.is_cancelled(self._context.task_id, self._context.redis):
            return True
        for ancestor_id in self._context.cancellation_chain:
            await running_tasks.heartbeat(ancestor_id, self._context.redis)
            if await running_tasks.is_cancelled(ancestor_id, self._context.redis):
                return True
        return False

    async def _await_approval(self, action: str, arguments: dict[str, object]) -> ApprovalDecision:
        preview = ", ".join(f"{k}={v!r}" for k, v in arguments.items())
        await self._repo.update_status(self._context.task_id, "paused")
        await self._context.event_emitter.status_changed(self._context.task_id, status="paused")
        await self._context.event_emitter.approval_required(
            self._context.task_id, action=action, preview=preview
        )

        decision = await running_tasks.wait_for_approval(self._context.task_id, self._context.redis)

        if decision.approved:
            self._context.approved_actions.add(action)
        await self._repo.update_status(self._context.task_id, "running")
        await self._context.event_emitter.status_changed(self._context.task_id, status="running")
        return decision

    async def _finish(
        self, status: AgentTaskStatus, *, summary: str | None = None, error: str | None = None
    ) -> AgentRunResult:
        await self._repo.update_status(self._context.task_id, status)
        if status == "completed":
            await self._context.event_emitter.completed(self._context.task_id, summary=summary or "")
        else:
            await self._context.event_emitter.failed(self._context.task_id, error=error or status)
        return AgentRunResult(status=status, summary=summary, error=error)

    def _build_system_prompt(self, task_description: str) -> str:
        return _SYSTEM_PROMPT_TEMPLATE.format(
            agent_type=self.agent_type,
            workspace_root=self._context.workspace_root,
            task_description=task_description,
        )
