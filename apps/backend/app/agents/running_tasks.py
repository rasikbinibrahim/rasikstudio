from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from uuid import UUID


class ApprovalGate:
    """One pending human-approval decision. `BaseAgent` awaits `wait()` after emitting
    `agent_approval_required`; `ApproveAgentStepUseCase` calls `resolve()` from a completely
    separate HTTP request's call stack — this is the hand-off between the two."""

    def __init__(self) -> None:
        self._event = asyncio.Event()
        self._approved = False

    def resolve(self, approved: bool) -> None:
        self._approved = approved
        self._event.set()

    async def wait(self) -> bool:
        await self._event.wait()
        return self._approved


@dataclass
class RunningTask:
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    approval_gate: ApprovalGate | None = None


class RunningTaskRegistry:
    """Process-wide table of in-flight agent tasks, keyed by task id. This only works because
    `RunAgentTaskUseCase.execute()` runs as an in-process `asyncio.create_task()` rather than a
    separate Celery worker process (AGENT_FRAMEWORK.md §10's implementation note) — a real
    multi-process/multi-replica deployment would need this state in Redis instead, keyed the same
    way `provider:available:{name}` is for `ProviderAvailabilityChecker`."""

    def __init__(self) -> None:
        self._tasks: dict[UUID, RunningTask] = {}

    def start(self, task_id: UUID) -> RunningTask:
        handle = RunningTask()
        self._tasks[task_id] = handle
        return handle

    def get(self, task_id: UUID) -> RunningTask | None:
        return self._tasks.get(task_id)

    def finish(self, task_id: UUID) -> None:
        self._tasks.pop(task_id, None)

    def request_cancel(self, task_id: UUID) -> bool:
        handle = self._tasks.get(task_id)
        if handle is None:
            return False
        handle.cancel_event.set()
        if handle.approval_gate is not None:
            # An approval-paused task has nothing left to poll its cancel_event until a human
            # answers the approval prompt — resolving it (as denied) is what actually lets a
            # paused task notice the cancellation promptly instead of hanging until approved.
            handle.approval_gate.resolve(False)
        return True

    def resolve_approval(self, task_id: UUID, approved: bool) -> bool:
        handle = self._tasks.get(task_id)
        if handle is None or handle.approval_gate is None:
            return False
        handle.approval_gate.resolve(approved)
        return True


running_tasks = RunningTaskRegistry()
