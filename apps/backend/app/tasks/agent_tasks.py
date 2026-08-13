from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import UUID

import structlog

from app.core.celery_app import celery_app

logger = structlog.get_logger("tasks.agent_tasks")


@celery_app.task(name="agent.run_task", max_retries=0)  # type: ignore[untyped-decorator]  # untyped in celery's stubs
def run_agent_task(
    *,
    task_id: str,
    workspace_id: str,
    workspace_root: str,
    user_id: str,
    model: str,
    description: str,
    agent_type: str,
    require_approval: bool,
) -> None:
    """Celery entrypoint for agent task execution (ADR 0004) — `RunAgentTaskUseCase.execute()`
    dispatches here via `.delay()` instead of the `asyncio.create_task()` this replaced. Every
    argument is a plain string (task/workspace/user ids as `str`, not `UUID`; `workspace_root` as
    `str`, not `Path`) because Celery's JSON serializer can't carry those types across the broker.

    Retries are deliberately disabled (`max_retries=0` above): re-running a partially-completed
    agent task from scratch means more tool calls and possibly more file writes, not a safe replay
    of an idempotent job — a transient failure here should surface as a `failed` `AgentTask` row
    (which `execute_agent_task`'s own `BaseAgent._finish()` already persists for failures inside
    the ReAct loop itself), not a silent Celery-level re-attempt.

    Each call gets its own event loop via `asyncio.run()` — `execute_agent_task` is async, Celery
    task dispatch is not. The shared `AsyncSessionLocal` engine (module-level, built once at
    import time — see `app/infrastructure/db/session.py`) is disposed at the top of every call
    before it's used: pooled asyncpg connections are bound to the event loop that opened them, so
    without this, the *next* task's fresh `asyncio.run()` loop would try to reuse a connection
    left over from a previous task's now-closed loop and fail. Disposing is cheap (drops idle
    connections, doesn't touch anything in current use) and makes every call safe regardless of
    which thread/previous task ran before it — see `celery_app.py`'s docstring for the full
    fork-vs-threads reasoning this is the other half of.
    """
    from app.agents.agent_factory import execute_agent_task
    from app.infrastructure.db.session import engine

    async def _run() -> None:
        await engine.dispose()
        await execute_agent_task(
            agent_type=agent_type,
            task_id=UUID(task_id),
            workspace_id=UUID(workspace_id),
            workspace_root=Path(workspace_root),
            user_id=UUID(user_id),
            model=model,
            description=description,
            require_approval=require_approval,
        )

    try:
        asyncio.run(_run())
    except Exception:
        logger.exception("agent_task_celery_run_failed", task_id=task_id)
        raise
