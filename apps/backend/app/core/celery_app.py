from celery import Celery

from app.core.config import get_settings
from app.core.logging import configure_logging


def create_celery_app() -> Celery:
    """ADR 0004's actual broker/worker infrastructure, standing beside the previous
    `asyncio.create_task()` alternative rather than replacing it everywhere: agent task execution
    (`app/tasks/agent_tasks.py`) and workspace RAG indexing (`app/tasks/indexing_tasks.py`)
    dispatch through this, chat message streaming (`application/chat/send_message.py`)
    deliberately does not — see this module's own docstring note below and ADR 0004's Outcome for
    why the two categories of background work don't share one mechanism.

    `--pool=threads` (not the default prefork) is the one non-obvious deployment choice load-
    bearing enough to explain here rather than only in the worker's own start command: prefork
    forks a child process per worker *after* this module (and therefore
    `app.infrastructure.db.session`'s module-level async engine) has already been imported by the
    parent — the child inherits the parent's asyncpg connections, which is a well-documented
    hazard (SQLAlchemy's own async-engine docs call out exactly this: pooled async connections are
    bound to the event loop that opened them and cannot be safely reused, let alone across a
    fork). Threads sidestep the fork entirely; each task still gets its own fresh event loop via
    `asyncio.run()` in `app/tasks/agent_tasks.py`, and that module disposes the shared engine at
    the start of every task specifically so a connection opened by a previous task's (now-closed)
    event loop is never reused by the next one.
    """
    settings = get_settings()
    configure_logging(settings)

    app = Celery(
        "rasik_studio",
        broker=settings.celery_broker_url,
        backend=settings.celery_result_backend_url,
        include=["app.tasks.agent_tasks", "app.tasks.indexing_tasks"],
    )
    app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="UTC",
        enable_utc=True,
        task_track_started=True,
        # Agent tasks (up to `MAX_ITERATIONS` LLM round-trips, each a real network call) are
        # long-running and not idempotent to simply re-run from the top — see
        # `app/tasks/agent_tasks.py`'s own docstring for why retries are disabled per-task rather
        # than configured here globally.
        worker_prefetch_multiplier=1,
        broker_connection_retry_on_startup=True,
    )
    return app


celery_app = create_celery_app()
