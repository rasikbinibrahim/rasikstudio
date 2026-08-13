from __future__ import annotations

import json
from collections.abc import Awaitable
from dataclasses import dataclass
from typing import cast
from uuid import UUID

from redis.asyncio import Redis

# Refreshed at every loop checkpoint in `BaseAgent.run()` (see `_check_cancelled` there) — long
# enough that a slow LLM round-trip within one iteration doesn't let the key expire out from under
# a still-live task, short enough that a worker that dies mid-task stops looking "active" to
# `cancel`/`approve` requests within a bounded window rather than hanging forever.
_HEARTBEAT_TTL_SECONDS = 120


class AgentQuestionCancelled(Exception):
    """Raised by `wait_for_answer` when the task is cancelled while blocked waiting on a human
    answer to `ask_followup_question` — the same real problem `request_cancel`'s approval-key
    push already solves for the approval gate (an agent blocked on a human response can't poll
    its own cancel key), solved the same way for questions instead of introducing a second
    mechanism. Caught by the `ask_followup_question` tool itself, not left to propagate through
    `ToolRegistry.execute`'s broad catch-and-stringify."""


@dataclass(frozen=True, slots=True)
class ApprovalDecision:
    approved: bool
    # Only ever set on a denial — an approval has nothing to explain. Lets the human say *why*
    # (e.g. "wrong file, try src/utils.ts instead"), which `BaseAgent._await_approval()` folds
    # into the denied tool call's own observation so the ReAct loop can plan around it instead of
    # just knowing the action was refused (Cline's equivalent rejection flow does the same —
    # see `docs/reference/cline/APPROVAL_GATE_NOTES.md`).
    reason: str | None = None


class RunningTaskRegistry:
    """Redis-backed coordination for in-flight agent tasks, keyed by task id. Replaced the
    original in-process `dict[UUID, RunningTask]` once agent task execution moved off
    `asyncio.create_task()` and onto a real Celery worker (ADR 0004) — Redis is the one thing both
    the API process (handling cancel/approve HTTP requests) and the worker process (running the
    task) share, which an in-process dict never could be once they're different processes.

    Four keys per task, all cleaned up together in `finish()`:
    - `agent:heartbeat:{id}` — existence means "some worker is actively running this task right
      now"; TTL-based so a crashed worker's task naturally stops looking active instead of
      hanging `cancel`/`approve` forever.
    - `agent:cancel:{id}` — set when cancellation is requested; `BaseAgent` polls it at every loop
      checkpoint (see `base_agent.py`'s `_check_cancelled`).
    - `agent:approval:{id}` — a Redis list used as a one-shot hand-off: `BaseAgent` blocks on
      `BLPOP` while awaiting a human decision, `resolve_approval`/`request_cancel` push the
      decision (or a synthetic denial, on cancel) onto it, JSON-encoded as an `ApprovalDecision`
      so a denial can optionally carry the human's reason back to the agent.
    - `agent:question:{id}` — the same one-shot `BLPOP` hand-off shape as `agent:approval:{id}`,
      for the `ask_followup_question` tool (`agents/tools/interaction_tools.py`) instead of the
      binary approval gate: `wait_for_answer`/`submit_answer` are its `wait_for_approval`/
      `resolve_approval` counterparts, and `request_cancel` unblocks whichever of the two a task
      happens to be waiting on.
    """

    @staticmethod
    def _heartbeat_key(task_id: UUID) -> str:
        return f"agent:heartbeat:{task_id}"

    @staticmethod
    def _cancel_key(task_id: UUID) -> str:
        return f"agent:cancel:{task_id}"

    @staticmethod
    def _approval_key(task_id: UUID) -> str:
        return f"agent:approval:{task_id}"

    @staticmethod
    def _question_key(task_id: UUID) -> str:
        return f"agent:question:{task_id}"

    async def start(self, task_id: UUID, redis: Redis) -> None:
        await redis.set(self._heartbeat_key(task_id), "1", ex=_HEARTBEAT_TTL_SECONDS)

    async def finish(self, task_id: UUID, redis: Redis) -> None:
        await redis.delete(
            self._heartbeat_key(task_id),
            self._cancel_key(task_id),
            self._approval_key(task_id),
            self._question_key(task_id),
        )

    async def is_active(self, task_id: UUID, redis: Redis) -> bool:
        return bool(await redis.exists(self._heartbeat_key(task_id)))

    async def heartbeat(self, task_id: UUID, redis: Redis) -> None:
        await redis.expire(self._heartbeat_key(task_id), _HEARTBEAT_TTL_SECONDS)

    async def is_cancelled(self, task_id: UUID, redis: Redis) -> bool:
        return bool(await redis.exists(self._cancel_key(task_id)))

    async def request_cancel(self, task_id: UUID, redis: Redis) -> bool:
        if not await self.is_active(task_id, redis):
            return False
        await redis.set(self._cancel_key(task_id), "1", ex=_HEARTBEAT_TTL_SECONDS)
        # An approval-paused (or question-paused) task has nothing left to poll its cancel key
        # until a human responds — pushing a synthetic decision onto *both* one-shot hand-off
        # lists is what lets it notice promptly (via whichever BLPOP it's actually blocked on)
        # instead of hanging until a human eventually answers. The push onto the list the task
        # isn't currently waiting on is a harmless no-op today (both lists are drained and
        # deleted together in `finish()` once the task actually ends) unless a *second*
        # approval/question happens later in the same still-running task before it ends, in which
        # case that stray leftover entry would be consumed first — an accepted, pre-existing
        # tradeoff of this one-shot-list design, not new to this method.
        await self._push_decision(redis, task_id, ApprovalDecision(approved=False, reason="Task cancelled"))
        await self._push_answer_cancellation(redis, task_id)
        return True

    async def resolve_approval(
        self, task_id: UUID, approved: bool, redis: Redis, *, reason: str | None = None
    ) -> bool:
        if not await self.is_active(task_id, redis):
            return False
        await self._push_decision(redis, task_id, ApprovalDecision(approved=approved, reason=reason))
        return True

    async def wait_for_approval(self, task_id: UUID, redis: Redis) -> ApprovalDecision:
        # redis-py's stubs type `blpop`/`rpush` as `Awaitable[T] | T` (shared between the sync and
        # async client classes) rather than committing to `Awaitable[T]` for this async client
        # specifically — the `cast` below just asserts what's true at runtime for `redis.asyncio`.
        _key, raw = await cast(
            "Awaitable[tuple[str, str]]", redis.blpop([self._approval_key(task_id)], timeout=0)
        )
        payload = json.loads(raw)
        return ApprovalDecision(approved=payload["approved"], reason=payload.get("reason"))

    async def _push_decision(self, redis: Redis, task_id: UUID, decision: ApprovalDecision) -> None:
        key = self._approval_key(task_id)
        await self._rpush(redis, key, json.dumps({"approved": decision.approved, "reason": decision.reason}))
        await redis.expire(key, _HEARTBEAT_TTL_SECONDS)

    async def submit_answer(self, task_id: UUID, answer: str, redis: Redis) -> bool:
        """Human-side counterpart to `wait_for_answer` — `AnswerAgentQuestionUseCase`'s single
        call. Returns `False` (a 409 to the caller) if the task isn't actively running in any
        worker process right now, same convention as `resolve_approval`."""
        if not await self.is_active(task_id, redis):
            return False
        key = self._question_key(task_id)
        await self._rpush(redis, key, json.dumps({"answer": answer}))
        await redis.expire(key, _HEARTBEAT_TTL_SECONDS)
        return True

    async def wait_for_answer(self, task_id: UUID, redis: Redis) -> str:
        """Agent-side blocking wait — the `ask_followup_question` tool's whole implementation.
        Raises `AgentQuestionCancelled` instead of returning if `request_cancel` pushed a
        cancellation sentinel here instead of a real answer."""
        _key, raw = await cast(
            "Awaitable[tuple[str, str]]", redis.blpop([self._question_key(task_id)], timeout=0)
        )
        payload = json.loads(raw)
        if payload.get("cancelled"):
            raise AgentQuestionCancelled
        return cast(str, payload["answer"])

    async def _push_answer_cancellation(self, redis: Redis, task_id: UUID) -> None:
        key = self._question_key(task_id)
        await self._rpush(redis, key, json.dumps({"cancelled": True}))
        await redis.expire(key, _HEARTBEAT_TTL_SECONDS)

    @staticmethod
    async def _rpush(redis: Redis, key: str, value: str) -> None:
        await cast("Awaitable[int]", redis.rpush(key, value))


running_tasks = RunningTaskRegistry()
