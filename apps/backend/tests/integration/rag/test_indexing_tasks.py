from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.infrastructure.db import session as db_session_module
from app.infrastructure.db.models.embedding import CodeEmbeddingModel
from app.infrastructure.rag import indexer as indexer_module
from app.tasks.indexing_tasks import index_workspace_task
from tests.integration.rag.test_indexer import FakeEmbeddingProvider


class TestIndexWorkspaceTaskCelery:
    async def test_the_real_celery_task_runs_index_workspace_to_completion(
        self, database_url, _migrated_schema, owned_workspace, redis_url, monkeypatch
    ) -> None:
        """Same real-execution-model verification as `tests/integration/agents/test_agent_tasks.py`:
        calls the real (not `.delay()`'d) `index_workspace_task` via `asyncio.to_thread()`, the
        same execution model a `--pool=threads` Celery worker uses, so it runs outside this test's
        own already-running event loop. Verifies the wrapper's actual job — reconstructing
        `UUID`/`Path` from the plain strings Celery's JSON transport carries, disposing the shared
        engine before use, and driving `index_workspace()` to a real, persisted result."""
        _, workspace = owned_workspace
        root_path = Path(workspace.root_path)
        (root_path / "a.py").write_text("x = 1\n")

        engine = create_async_engine(database_url)
        sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        monkeypatch.setattr(indexer_module, "AsyncSessionLocal", sessionmaker)
        monkeypatch.setattr(db_session_module, "engine", engine)
        monkeypatch.setattr(indexer_module, "ai_providers", {"ollama": FakeEmbeddingProvider()})
        monkeypatch.setenv("REDIS_URL", redis_url)

        await asyncio.to_thread(
            index_workspace_task,
            workspace_id=str(workspace.id),
            workspace_root=str(root_path),
            user_id="00000000-0000-0000-0000-000000000000",
        )
        await engine.dispose()

        async with sessionmaker() as session:
            result = await session.execute(
                select(CodeEmbeddingModel).where(CodeEmbeddingModel.workspace_id == workspace.id)
            )
            rows = list(result.scalars())
        assert {row.file_path for row in rows} == {"a.py"}

    async def test_two_sequential_real_invocations_each_get_a_working_db_session(
        self, database_url, _migrated_schema, owned_workspace, redis_url, monkeypatch
    ) -> None:
        """The same cross-event-loop connection-reuse hazard `test_agent_tasks.py` proves a fix
        for, exercised here for the indexing task's own independent `engine.dispose()` call."""
        _, workspace = owned_workspace
        root_path = Path(workspace.root_path)
        (root_path / "a.py").write_text("x = 1\n")

        engine = create_async_engine(database_url)
        sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        monkeypatch.setattr(indexer_module, "AsyncSessionLocal", sessionmaker)
        monkeypatch.setattr(db_session_module, "engine", engine)
        monkeypatch.setattr(indexer_module, "ai_providers", {"ollama": FakeEmbeddingProvider()})
        monkeypatch.setenv("REDIS_URL", redis_url)

        for _ in range(2):
            await asyncio.to_thread(
                index_workspace_task,
                workspace_id=str(workspace.id),
                workspace_root=str(root_path),
                user_id="00000000-0000-0000-0000-000000000000",
            )
        await engine.dispose()

    async def test_an_infrastructure_level_failure_is_logged_and_re_raised(
        self, database_url, _migrated_schema, redis_url, monkeypatch, tmp_path
    ) -> None:
        """A `workspace_id` with no matching real `workspaces` row: `os.walk` happily finds the
        one real file in `tmp_path`, but `EmbeddingRepository.upsert()`'s insert violates
        `code_embeddings.workspace_id`'s real foreign-key constraint — a genuine database-level
        failure, not a contrived one, proving the wrapper's `except Exception:
        logger.exception(...); raise` isn't dead code."""
        from uuid import uuid4

        (tmp_path / "a.py").write_text("x = 1\n")

        engine = create_async_engine(database_url)
        sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        monkeypatch.setattr(indexer_module, "AsyncSessionLocal", sessionmaker)
        monkeypatch.setattr(db_session_module, "engine", engine)
        monkeypatch.setattr(indexer_module, "ai_providers", {"ollama": FakeEmbeddingProvider()})
        monkeypatch.setenv("REDIS_URL", redis_url)

        with pytest.raises(Exception):  # noqa: B017 — real error class is SQLAlchemy's IntegrityError
            await asyncio.to_thread(
                index_workspace_task,
                workspace_id=str(uuid4()),
                workspace_root=str(tmp_path),
                user_id="00000000-0000-0000-0000-000000000000",
            )

        await engine.dispose()
