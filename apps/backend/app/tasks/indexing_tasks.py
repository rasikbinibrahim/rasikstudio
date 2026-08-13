from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import UUID

import structlog

from app.core.celery_app import celery_app

logger = structlog.get_logger("tasks.indexing_tasks")


@celery_app.task(name="rag.index_workspace", max_retries=0)  # type: ignore[untyped-decorator]  # untyped in celery's stubs
def index_workspace_task(*, workspace_id: str, workspace_root: str, user_id: str) -> None:
    """Celery entrypoint for RAG indexing (RAG_SYSTEM.md §2, ADR 0004's other named consumer
    besides agent tasks). `user_id` is carried through only for this task's own structured
    logging, not passed into `index_workspace()` itself, which has no authorization decision left
    to make by the time it runs — `IndexWorkspaceUseCase` already verified ownership before
    dispatching. See `app/tasks/agent_tasks.py`'s docstring for why every argument here is a plain
    `str` (Celery's JSON transport) and why the shared DB engine is disposed at the top of every
    call (pooled asyncpg connections are bound to the event loop that opened them; each call gets
    a fresh one via `asyncio.run()`). Retries are disabled for the same reason `agent_tasks.py`'s
    are: a partial re-run isn't a safe replay — `index_workspace()`'s own per-chunk hash check
    already makes a *second* full run cheap (nothing re-embeds unless it actually changed), so a
    failed run's natural recovery is just triggering `POST /workspaces/{id}/index` again, not an
    automatic retry silently repeating whatever failed.
    """
    from app.infrastructure.db.session import engine
    from app.infrastructure.rag.indexer import index_workspace

    async def _run() -> None:
        await engine.dispose()
        result = await index_workspace(workspace_id=UUID(workspace_id), workspace_root=Path(workspace_root))
        logger.info(
            "rag_index_completed",
            workspace_id=workspace_id,
            user_id=user_id,
            files_seen=result.files_seen,
            files_deleted=result.files_deleted,
            chunks_embedded=result.chunks_embedded,
            chunks_skipped=result.chunks_skipped,
        )

    try:
        asyncio.run(_run())
    except Exception:
        logger.exception("rag_index_task_failed", workspace_id=workspace_id, user_id=user_id)
        raise
