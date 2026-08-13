from __future__ import annotations

import asyncio
import hashlib
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import structlog
from redis.asyncio import Redis

from app.api.ws.event_types import IndexProgressEvent
from app.api.ws.publisher import publish_event
from app.core.config import get_settings
from app.domain.services.chunker import (
    EXCLUDED_DIR_NAMES,
    MAX_FILE_SIZE_BYTES,
    MAX_TRUNCATED_CHARS,
    TextChunk,
    chunk_text,
    is_indexable,
    language_for,
)
from app.infrastructure.ai.embedding_service import EmbeddingService
from app.infrastructure.ai.model_router import load_fallback_chains
from app.infrastructure.ai.providers import ai_providers
from app.infrastructure.db.repositories.embedding_repository import EmbeddingRepository
from app.infrastructure.db.session import AsyncSessionLocal

logger = structlog.get_logger("infrastructure.rag.indexer")


@dataclass(frozen=True, slots=True)
class IndexResult:
    files_seen: int
    files_deleted: int
    chunks_embedded: int
    chunks_skipped: int
    # Files whose real `os.stat()` (mtime + size) matched `indexed_files`' cached value from the
    # last run — skipped before any read/chunk work happened at all, not just before embedding.
    # Distinct from `chunks_skipped` (a per-chunk content-hash match *within* a file that *was*
    # read) — this counts whole files the pre-check let the indexer avoid opening entirely.
    files_skipped_unchanged: int = 0


async def index_workspace(*, workspace_id: UUID, workspace_root: Path) -> IndexResult:
    """The one place that actually walks a workspace, chunks its files, embeds the chunks that
    changed, and reconciles `code_embeddings` against what's really on disk — RAG_SYSTEM.md §2's
    "Indexing Worker" step. Mirrors `agents/agent_factory.execute_agent_task()`'s structure
    deliberately (self-contained: builds its own DB session and Redis client rather than reusing
    request-scoped ones), for the same reason — this runs inside a Celery worker
    (`app/tasks/indexing_tasks.py`), not a FastAPI request. No `user_id`/authorization check here
    — the caller (`IndexWorkspaceUseCase`) already verified ownership before dispatching; progress
    events publish workspace-wide (`shared=True`), matching `publisher.py`'s own documented
    reasoning that index progress belongs to everyone connected to the workspace, not just
    whoever triggered it.
    """
    settings = get_settings()
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        async with AsyncSessionLocal() as session:
            embedding_repo = EmbeddingRepository(session)
            embedding_service = EmbeddingService(
                ai_providers, load_fallback_chains(settings.fallback_chains_path)
            )

            files = await asyncio.to_thread(_list_indexable_files, workspace_root)
            total = len(files)
            seen_paths: set[str] = set()
            chunks_embedded = 0
            chunks_skipped = 0
            files_skipped_unchanged = 0

            # Fetched once for the whole run, not per file — the file-level pre-check this backs
            # (PERFORMANCE_GUIDE.md §1's original ask) is specifically about avoiding *per-file*
            # DB round trips as much as avoiding the read+chunk work itself.
            file_metadata = await embedding_repo.get_file_index_metadata(workspace_id=workspace_id)

            await _publish_progress(redis, workspace_id, files_done=0, files_total=total)

            for done, path in enumerate(files, start=1):
                rel_path = str(path.relative_to(workspace_root))
                seen_paths.add(rel_path)
                try:
                    stat = await asyncio.to_thread(path.stat)
                    if file_metadata.get(rel_path) == (stat.st_mtime, stat.st_size):
                        # Real stat unchanged since the last run — same file-level short-circuit
                        # `EmbeddingRepository.get_content_hashes()`'s per-chunk check already
                        # provides for embedding calls, now applied before the read+chunk work
                        # that check happens *after*.
                        files_skipped_unchanged += 1
                    else:
                        embedded, skipped = await _index_one_file(
                            path, rel_path, workspace_id, embedding_repo, embedding_service
                        )
                        chunks_embedded += embedded
                        chunks_skipped += skipped
                        await embedding_repo.upsert_file_index_metadata(
                            workspace_id=workspace_id,
                            file_path=rel_path,
                            mtime=stat.st_mtime,
                            size_bytes=stat.st_size,
                        )
                except Exception:
                    # One unreadable/unembeddable file shouldn't abort indexing the other 999 —
                    # logged so it's not silently lost, but the loop continues.
                    logger.exception(
                        "rag_index_file_failed", workspace_id=str(workspace_id), file_path=rel_path
                    )
                await _publish_progress(redis, workspace_id, files_done=done, files_total=total)

            stale_paths = (
                await embedding_repo.list_indexed_file_paths(workspace_id=workspace_id)
                | set(file_metadata.keys())
            ) - seen_paths
            for rel_path in stale_paths:
                await embedding_repo.delete_for_file(workspace_id=workspace_id, file_path=rel_path)
                await embedding_repo.delete_file_index_metadata(workspace_id=workspace_id, file_path=rel_path)

            await session.commit()

            return IndexResult(
                files_seen=total,
                files_deleted=len(stale_paths),
                chunks_embedded=chunks_embedded,
                chunks_skipped=chunks_skipped,
                files_skipped_unchanged=files_skipped_unchanged,
            )
    finally:
        await redis.aclose()


async def _index_one_file(
    path: Path,
    rel_path: str,
    workspace_id: UUID,
    embedding_repo: EmbeddingRepository,
    embedding_service: EmbeddingService,
) -> tuple[int, int]:
    """Returns `(chunks_embedded, chunks_skipped)` for this one file. A chunk is skipped —  not
    re-embedded — whenever its SHA-256 content hash matches what's already stored for that exact
    `chunk_index`, avoiding a real (rate-limited, and billed for cloud providers) embedding call
    for content that hasn't actually changed since the last index run."""
    try:
        raw = await asyncio.to_thread(path.read_bytes)
    except OSError:
        return (0, 0)

    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError:
        return (0, 0)  # extension said "text", the actual bytes disagree — skip rather than index garbage

    if len(raw) > MAX_FILE_SIZE_BYTES:
        content = content[:MAX_TRUNCATED_CHARS]

    chunks = chunk_text(content)
    if not chunks:
        return (0, 0)

    existing_hashes = await embedding_repo.get_content_hashes(workspace_id=workspace_id, file_path=rel_path)
    language = language_for(path)

    to_embed: list[TextChunk] = []
    hashes: dict[int, str] = {}
    for chunk in chunks:
        content_hash = hashlib.sha256(chunk.content.encode("utf-8")).hexdigest()
        hashes[chunk.index] = content_hash
        if existing_hashes.get(chunk.index) != content_hash:
            to_embed.append(chunk)

    if to_embed:
        # One batched call for every changed chunk in this file, not one call per chunk —
        # `EmbeddingService.embed()` already supports a full batch in a single provider call
        # (MODEL_ROUTER.md §3), and per-file batching is the natural granularity here.
        vectors = await embedding_service.embed([chunk.content for chunk in to_embed])
        for chunk, vector in zip(to_embed, vectors, strict=True):
            await embedding_repo.upsert(
                workspace_id=workspace_id,
                content=chunk.content,
                embedding=vector,
                metadata={
                    "file_path": rel_path,
                    "chunk_index": chunk.index,
                    "content_hash": hashes[chunk.index],
                    "language": language,
                    "start_line": chunk.start_line,
                    "end_line": chunk.end_line,
                },
            )

    # Prunes stale tail chunks from a file that shrank since its last index run.
    await embedding_repo.delete_chunks_from_index(
        workspace_id=workspace_id, file_path=rel_path, from_index=len(chunks)
    )

    return (len(to_embed), len(chunks) - len(to_embed))


def _list_indexable_files(root: Path) -> list[Path]:
    """Synchronous (real filesystem I/O) — always called via `asyncio.to_thread`. `os.walk`'s
    in-place `dirnames[:] = ...` pruning skips descending into excluded directories entirely
    (`node_modules` et al.), rather than walking in and filtering their contents out afterward."""
    files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDED_DIR_NAMES]
        for name in filenames:
            path = Path(dirpath) / name
            if is_indexable(path):
                files.append(path)
    return sorted(files)


async def _publish_progress(redis: Redis, workspace_id: UUID, *, files_done: int, files_total: int) -> None:
    await publish_event(
        redis,
        IndexProgressEvent(
            workspace_id=workspace_id,
            timestamp=datetime.now(UTC),
            files_done=files_done,
            files_total=files_total,
        ),
        shared=True,
    )
