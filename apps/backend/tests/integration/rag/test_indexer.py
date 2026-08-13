from __future__ import annotations

import os
import time
from pathlib import Path

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.infrastructure.db.models.embedding import EMBEDDING_DIMENSIONS, CodeEmbeddingModel, IndexedFileModel
from app.infrastructure.rag import indexer as indexer_module
from app.infrastructure.rag.indexer import index_workspace


class FakeEmbeddingProvider:
    """Real `EmbeddingService`/`resolve_provider_name` routing, fake network call — the only
    boundary worth faking here, matching this codebase's established "inject at the boundary,
    keep everything else real" approach (e.g. `ScriptedRouter` in
    `tests/integration/agents/test_agent_execution.py`)."""

    def __init__(self) -> None:
        self.embed_calls: list[list[str]] = []

    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        self.embed_calls.append(list(texts))
        return [_deterministic_vector(text) for text in texts]


def _deterministic_vector(text: str) -> list[float]:
    seed = float(sum(text.encode("utf-8")) % 1000)
    return [seed, *([0.0] * (EMBEDDING_DIMENSIONS - 1))]


def _patch_infrastructure(monkeypatch, database_url: str, redis_url: str, provider: FakeEmbeddingProvider):
    engine = create_async_engine(database_url)
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(indexer_module, "AsyncSessionLocal", sessionmaker)
    monkeypatch.setattr(indexer_module, "ai_providers", {"ollama": provider})
    monkeypatch.setenv("REDIS_URL", redis_url)
    return engine


async def _embeddings_for(db_sessionmaker, workspace_id):
    async with db_sessionmaker() as session:
        result = await session.execute(
            select(CodeEmbeddingModel).where(CodeEmbeddingModel.workspace_id == workspace_id)
        )
        return list(result.scalars())


async def _indexed_file_metadata_for(db_sessionmaker, workspace_id):
    async with db_sessionmaker() as session:
        result = await session.execute(
            select(IndexedFileModel).where(IndexedFileModel.workspace_id == workspace_id)
        )
        return {row.file_path: (row.mtime, row.size_bytes) for row in result.scalars()}


class TestIndexWorkspace:
    async def test_indexes_real_files_and_skips_excluded_directories(
        self, database_url, _migrated_schema, owned_workspace, db_sessionmaker, redis_url, monkeypatch
    ) -> None:
        _, workspace = owned_workspace
        root_path = Path(workspace.root_path)
        (root_path / "src").mkdir()
        (root_path / "src" / "app.py").write_text("def handler():\n    return 42\n")
        (root_path / "node_modules").mkdir()
        (root_path / "node_modules" / "ignored.py").write_text("should never be indexed")
        (root_path / "README.md").write_text("# Project\n\nSome docs.\n")
        (root_path / "image.png").write_bytes(b"\x89PNG\r\n\x1a\n")  # real binary, non-indexable ext

        provider = FakeEmbeddingProvider()
        engine = _patch_infrastructure(monkeypatch, database_url, redis_url, provider)

        result = await index_workspace(workspace_id=workspace.id, workspace_root=root_path)
        await engine.dispose()

        assert result.files_seen == 2  # src/app.py, README.md — not node_modules/, not image.png
        rows = await _embeddings_for(db_sessionmaker, workspace.id)
        indexed_paths = {row.file_path for row in rows}
        assert indexed_paths == {"src/app.py", "README.md"}
        assert all(row.embedding is not None and len(row.embedding) == EMBEDDING_DIMENSIONS for row in rows)

    async def test_publishes_real_progress_events_over_the_shared_workspace_channel(
        self, database_url, _migrated_schema, owned_workspace, redis_url, monkeypatch
    ) -> None:
        _, workspace = owned_workspace
        root_path = Path(workspace.root_path)
        (root_path / "a.py").write_text("x = 1\n")

        provider = FakeEmbeddingProvider()
        engine = _patch_infrastructure(monkeypatch, database_url, redis_url, provider)

        redis = Redis.from_url(redis_url, decode_responses=True)
        pubsub = redis.pubsub()
        await pubsub.subscribe(f"ws:workspace:{workspace.id}:shared")
        await pubsub.get_message(timeout=1)  # subscribe confirmation

        await index_workspace(workspace_id=workspace.id, workspace_root=root_path)
        await engine.dispose()

        messages = []
        for _ in range(5):
            msg = await pubsub.get_message(timeout=1)
            if msg and msg["type"] == "message":
                messages.append(msg["data"])
        await pubsub.aclose()
        await redis.aclose()

        assert any('"index_progress"' in m and '"files_done":0' in m for m in messages)
        assert any('"index_progress"' in m and '"files_done":1' in m for m in messages)

    async def test_reindexing_unchanged_content_does_not_call_embed_again(
        self, database_url, _migrated_schema, owned_workspace, redis_url, monkeypatch
    ) -> None:
        _, workspace = owned_workspace
        root_path = Path(workspace.root_path)
        (root_path / "a.py").write_text("x = 1\n")

        provider = FakeEmbeddingProvider()
        engine = _patch_infrastructure(monkeypatch, database_url, redis_url, provider)

        await index_workspace(workspace_id=workspace.id, workspace_root=root_path)
        first_call_count = len(provider.embed_calls)
        assert first_call_count == 1

        await index_workspace(workspace_id=workspace.id, workspace_root=root_path)
        await engine.dispose()

        assert len(provider.embed_calls) == first_call_count  # no new embed() call at all

    async def test_changing_a_file_only_re_embeds_it_not_untouched_files(
        self, database_url, _migrated_schema, owned_workspace, redis_url, monkeypatch
    ) -> None:
        _, workspace = owned_workspace
        root_path = Path(workspace.root_path)
        (root_path / "a.py").write_text("x = 1\n")
        (root_path / "b.py").write_text("y = 2\n")

        provider = FakeEmbeddingProvider()
        engine = _patch_infrastructure(monkeypatch, database_url, redis_url, provider)

        await index_workspace(workspace_id=workspace.id, workspace_root=root_path)
        (root_path / "a.py").write_text("x = 999  # changed\n")

        await index_workspace(workspace_id=workspace.id, workspace_root=root_path)
        await engine.dispose()

        # First run: one embed() call per file (a.py, b.py) = 2. Second run: only a.py changed,
        # so exactly one more embed() call, for a.py's new content only.
        assert len(provider.embed_calls) == 3
        assert provider.embed_calls[-1] == ["x = 999  # changed\n"]

    async def test_deleting_a_file_removes_its_stored_embeddings_on_reindex(
        self, database_url, _migrated_schema, owned_workspace, db_sessionmaker, redis_url, monkeypatch
    ) -> None:
        _, workspace = owned_workspace
        root_path = Path(workspace.root_path)
        (root_path / "a.py").write_text("x = 1\n")
        (root_path / "b.py").write_text("y = 2\n")

        provider = FakeEmbeddingProvider()
        engine = _patch_infrastructure(monkeypatch, database_url, redis_url, provider)

        await index_workspace(workspace_id=workspace.id, workspace_root=root_path)
        (root_path / "a.py").unlink()

        result = await index_workspace(workspace_id=workspace.id, workspace_root=root_path)
        await engine.dispose()

        assert result.files_deleted == 1
        rows = await _embeddings_for(db_sessionmaker, workspace.id)
        assert {row.file_path for row in rows} == {"b.py"}

    async def test_a_file_that_is_not_real_utf8_text_is_skipped_without_crashing(
        self, database_url, _migrated_schema, owned_workspace, db_sessionmaker, redis_url, monkeypatch
    ) -> None:
        _, workspace = owned_workspace
        root_path = Path(workspace.root_path)
        # A real .py extension (passes the extension filter) but genuinely invalid UTF-8 bytes —
        # the extension lied, the content is what actually decides.
        (root_path / "broken.py").write_bytes(b"\xff\xfe\x00\x01not valid utf-8")
        (root_path / "fine.py").write_text("z = 3\n")

        provider = FakeEmbeddingProvider()
        engine = _patch_infrastructure(monkeypatch, database_url, redis_url, provider)

        result = await index_workspace(workspace_id=workspace.id, workspace_root=root_path)
        await engine.dispose()

        assert result.files_seen == 2  # both counted as "seen" (walked), only one actually indexed
        rows = await _embeddings_for(db_sessionmaker, workspace.id)
        assert {row.file_path for row in rows} == {"fine.py"}

    async def test_shrinking_a_file_prunes_its_now_stale_tail_chunks(
        self, database_url, _migrated_schema, owned_workspace, db_sessionmaker, redis_url, monkeypatch
    ) -> None:
        _, workspace = owned_workspace
        root_path = Path(workspace.root_path)
        # Real content long enough to force multiple real 512-token chunks.
        long_content = "\n".join(f"value_{i} = {i}" for i in range(3000))
        (root_path / "big.py").write_text(long_content)

        provider = FakeEmbeddingProvider()
        engine = _patch_infrastructure(monkeypatch, database_url, redis_url, provider)

        await index_workspace(workspace_id=workspace.id, workspace_root=root_path)
        rows_before = await _embeddings_for(db_sessionmaker, workspace.id)
        assert len(rows_before) > 1  # confirms this file really did split into multiple chunks

        (root_path / "big.py").write_text("value_0 = 0\n")  # shrink drastically
        await index_workspace(workspace_id=workspace.id, workspace_root=root_path)
        await engine.dispose()

        rows_after = await _embeddings_for(db_sessionmaker, workspace.id)
        assert len(rows_after) == 1

    async def test_a_file_over_the_size_cap_is_truncated_not_skipped(
        self, database_url, _migrated_schema, owned_workspace, db_sessionmaker, redis_url, monkeypatch
    ) -> None:
        from app.domain.services.chunker import MAX_FILE_SIZE_BYTES

        _, workspace = owned_workspace
        root_path = Path(workspace.root_path)
        full_line_count = MAX_FILE_SIZE_BYTES // 6 + 1000
        (root_path / "huge.py").write_text("x = 1\n" * full_line_count)

        provider = FakeEmbeddingProvider()
        engine = _patch_infrastructure(monkeypatch, database_url, redis_url, provider)

        result = await index_workspace(workspace_id=workspace.id, workspace_root=root_path)
        await engine.dispose()

        assert result.files_seen == 1
        rows = await _embeddings_for(db_sessionmaker, workspace.id)
        assert len(rows) > 0  # truncated, not skipped
        # Real proof of truncation: none of the *chunk overlaps notwithstanding* would even be
        # possible if the truncation hadn't happened first — the untruncated file has
        # `full_line_count` real lines; every stored chunk's own end_line stays far below that,
        # since `chunk_text()` only ever saw the first MAX_TRUNCATED_CHARS characters.
        assert all(row.end_line < full_line_count // 10 for row in rows)

    async def test_a_whitespace_only_file_produces_no_chunks_and_is_not_indexed(
        self, database_url, _migrated_schema, owned_workspace, db_sessionmaker, redis_url, monkeypatch
    ) -> None:
        _, workspace = owned_workspace
        root_path = Path(workspace.root_path)
        (root_path / "empty.py").write_text("   \n\n  \n")

        provider = FakeEmbeddingProvider()
        engine = _patch_infrastructure(monkeypatch, database_url, redis_url, provider)

        result = await index_workspace(workspace_id=workspace.id, workspace_root=root_path)
        await engine.dispose()

        assert result.files_seen == 1
        rows = await _embeddings_for(db_sessionmaker, workspace.id)
        assert rows == []
        assert provider.embed_calls == []


class TestFileLevelPreCheck:
    """`IndexResult.files_skipped_unchanged` and the `indexed_files` table it's backed by —
    the stat-based short-circuit that skips reading/chunking a file entirely, not just
    re-embedding it (that per-chunk case is already covered by `TestIndexWorkspace`'s
    `test_reindexing_unchanged_content_does_not_call_embed_again`)."""

    async def test_first_index_run_skips_nothing(
        self, database_url, _migrated_schema, owned_workspace, redis_url, monkeypatch
    ) -> None:
        _, workspace = owned_workspace
        root_path = Path(workspace.root_path)
        (root_path / "a.py").write_text("x = 1\n")

        provider = FakeEmbeddingProvider()
        engine = _patch_infrastructure(monkeypatch, database_url, redis_url, provider)

        result = await index_workspace(workspace_id=workspace.id, workspace_root=root_path)
        await engine.dispose()

        assert result.files_skipped_unchanged == 0

    async def test_reindexing_an_untouched_workspace_skips_every_file_before_reading_it(
        self, database_url, _migrated_schema, owned_workspace, redis_url, monkeypatch
    ) -> None:
        _, workspace = owned_workspace
        root_path = Path(workspace.root_path)
        (root_path / "a.py").write_text("x = 1\n")
        (root_path / "b.py").write_text("y = 2\n")

        provider = FakeEmbeddingProvider()
        engine = _patch_infrastructure(monkeypatch, database_url, redis_url, provider)

        await index_workspace(workspace_id=workspace.id, workspace_root=root_path)
        embed_calls_after_first_run = len(provider.embed_calls)

        result = await index_workspace(workspace_id=workspace.id, workspace_root=root_path)
        await engine.dispose()

        assert result.files_skipped_unchanged == 2
        # The pre-check short-circuits before any read/chunk work, so no *new* embed() calls at
        # all on the second run — a stronger assertion than "same count", since it also proves
        # the per-chunk hash check in `_index_one_file` was never even reached.
        assert len(provider.embed_calls) == embed_calls_after_first_run

    async def test_touching_a_files_mtime_without_changing_content_still_forces_a_reread(
        self, database_url, _migrated_schema, owned_workspace, redis_url, monkeypatch
    ) -> None:
        """Documents the real tradeoff of a stat-based (not content-hash-based) pre-check: bumping
        mtime alone, with byte-identical content, is indistinguishable from a real edit and costs
        a re-read — cheap insurance against false "unchanged" positives, paid for by this one
        false-negative case."""
        _, workspace = owned_workspace
        root_path = Path(workspace.root_path)
        file_path = root_path / "a.py"
        file_path.write_text("x = 1\n")

        provider = FakeEmbeddingProvider()
        engine = _patch_infrastructure(monkeypatch, database_url, redis_url, provider)

        await index_workspace(workspace_id=workspace.id, workspace_root=root_path)

        stat = file_path.stat()
        future = time.time() + 120
        os.utime(file_path, (future, future))
        assert file_path.stat().st_size == stat.st_size  # content genuinely unchanged

        result = await index_workspace(workspace_id=workspace.id, workspace_root=root_path)
        await engine.dispose()

        assert result.files_skipped_unchanged == 0
        # Re-read, re-chunked, and hashed — but the per-chunk content hash still matches, so no
        # new embed() call happens even though the file-level pre-check didn't skip it.
        assert len(provider.embed_calls) == 1

    async def test_indexed_files_table_records_the_real_stat_of_each_indexed_file(
        self, database_url, _migrated_schema, owned_workspace, db_sessionmaker, redis_url, monkeypatch
    ) -> None:
        _, workspace = owned_workspace
        root_path = Path(workspace.root_path)
        file_path = root_path / "a.py"
        file_path.write_text("x = 1\n")

        provider = FakeEmbeddingProvider()
        engine = _patch_infrastructure(monkeypatch, database_url, redis_url, provider)

        await index_workspace(workspace_id=workspace.id, workspace_root=root_path)
        await engine.dispose()

        metadata = await _indexed_file_metadata_for(db_sessionmaker, workspace.id)
        stat = file_path.stat()
        assert metadata == {"a.py": (stat.st_mtime, stat.st_size)}

    async def test_deleting_a_file_also_clears_its_indexed_file_metadata(
        self, database_url, _migrated_schema, owned_workspace, db_sessionmaker, redis_url, monkeypatch
    ) -> None:
        _, workspace = owned_workspace
        root_path = Path(workspace.root_path)
        (root_path / "a.py").write_text("x = 1\n")
        (root_path / "b.py").write_text("y = 2\n")

        provider = FakeEmbeddingProvider()
        engine = _patch_infrastructure(monkeypatch, database_url, redis_url, provider)

        await index_workspace(workspace_id=workspace.id, workspace_root=root_path)
        (root_path / "a.py").unlink()

        await index_workspace(workspace_id=workspace.id, workspace_root=root_path)
        await engine.dispose()

        metadata = await _indexed_file_metadata_for(db_sessionmaker, workspace.id)
        assert set(metadata) == {"b.py"}
