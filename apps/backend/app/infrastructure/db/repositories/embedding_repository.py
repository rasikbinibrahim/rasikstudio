from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import delete, distinct, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.domain.ports.vector_store import VectorSearchResult
from app.infrastructure.db.models.embedding import CodeEmbeddingModel, IndexedFileModel
from app.infrastructure.db.repositories.base import BaseRepository


class EmbeddingRepository(BaseRepository[CodeEmbeddingModel]):
    """Implements `VectorStore` against `code_embeddings`. `metadata` carries the embedding-
    specific fields (`file_path`, `chunk_index`, `content_hash`, ...) that don't belong on the
    generic Protocol shared with `MemoryRepository`. Upsert/dedup logic matches
    RAG_SYSTEM.md §3.5's `upsert_chunk` reference implementation."""

    model = CodeEmbeddingModel

    async def upsert(
        self, *, workspace_id: UUID, content: str, embedding: list[float], metadata: dict[str, object]
    ) -> UUID:
        file_path = metadata["file_path"]
        chunk_index = metadata["chunk_index"]
        content_hash = metadata["content_hash"]

        stmt = (
            pg_insert(CodeEmbeddingModel)
            .values(
                id=uuid4(),
                workspace_id=workspace_id,
                file_path=file_path,
                chunk_index=chunk_index,
                content=content,
                embedding=embedding,
                language=metadata.get("language"),
                start_line=metadata.get("start_line"),
                end_line=metadata.get("end_line"),
                content_hash=content_hash,
            )
            .on_conflict_do_update(
                index_elements=["workspace_id", "file_path", "chunk_index"],
                set_={"content": content, "embedding": embedding, "content_hash": content_hash},
                where=CodeEmbeddingModel.content_hash != content_hash,
            )
        )
        await self._session.execute(stmt)
        await self._session.flush()

        # ON CONFLICT DO UPDATE's WHERE clause means an unchanged chunk performs neither an
        # insert nor an update, so nothing comes back via RETURNING — look the row up by its
        # unique key afterward instead, which is correct whichever of the three happened.
        result = await self._session.execute(
            select(CodeEmbeddingModel.id).where(
                CodeEmbeddingModel.workspace_id == workspace_id,
                CodeEmbeddingModel.file_path == file_path,
                CodeEmbeddingModel.chunk_index == chunk_index,
            )
        )
        return result.scalar_one()

    async def search(
        self, *, workspace_id: UUID, query_embedding: list[float], top_k: int = 5
    ) -> list[VectorSearchResult]:
        distance = CodeEmbeddingModel.embedding.cosine_distance(query_embedding)
        stmt = (
            select(CodeEmbeddingModel, distance.label("distance"))
            .where(CodeEmbeddingModel.workspace_id == workspace_id)
            .order_by(distance)
            .limit(top_k)
        )
        result = await self._session.execute(stmt)
        return [
            VectorSearchResult(
                id=row.CodeEmbeddingModel.id,
                content=row.CodeEmbeddingModel.content,
                distance=row.distance,
                metadata={
                    "file_path": row.CodeEmbeddingModel.file_path,
                    "chunk_index": row.CodeEmbeddingModel.chunk_index,
                    "language": row.CodeEmbeddingModel.language,
                },
            )
            for row in result
        ]

    async def delete(self, *, workspace_id: UUID, entry_id: UUID) -> None:
        instance = await self.get(entry_id)
        if instance is not None and instance.workspace_id == workspace_id:
            await self.remove(instance)

    async def get_content_hashes(self, *, workspace_id: UUID, file_path: str) -> dict[int, str]:
        """`chunk_index -> content_hash` for every chunk currently stored for one file — the
        indexing pipeline (`infrastructure/rag/indexer.py`) checks this *before* calling the
        embedding provider, so a chunk whose hash hasn't changed since the last index run never
        costs a real (rate-limited, billed for cloud providers) embedding call. `upsert()`'s own
        `WHERE content_hash != ...` clause is a second, cheaper safety net at the database level,
        not a substitute for this — that clause still requires the embedding to have already been
        computed by the time it runs."""
        result = await self._session.execute(
            select(CodeEmbeddingModel.chunk_index, CodeEmbeddingModel.content_hash).where(
                CodeEmbeddingModel.workspace_id == workspace_id,
                CodeEmbeddingModel.file_path == file_path,
            )
        )
        return {row.chunk_index: row.content_hash for row in result}

    async def delete_chunks_from_index(self, *, workspace_id: UUID, file_path: str, from_index: int) -> None:
        """Prunes stale chunks left over when a file shrinks (fewer chunks than its previous index
        run produced) — without this, the tail chunks from a longer, earlier version of the file
        would linger in `code_embeddings` and keep showing up in semantic search results forever."""
        await self._session.execute(
            delete(CodeEmbeddingModel).where(
                CodeEmbeddingModel.workspace_id == workspace_id,
                CodeEmbeddingModel.file_path == file_path,
                CodeEmbeddingModel.chunk_index >= from_index,
            )
        )
        await self._session.flush()

    async def list_indexed_file_paths(self, *, workspace_id: UUID) -> set[str]:
        result = await self._session.execute(
            select(distinct(CodeEmbeddingModel.file_path)).where(
                CodeEmbeddingModel.workspace_id == workspace_id
            )
        )
        return set(result.scalars())

    async def delete_for_file(self, *, workspace_id: UUID, file_path: str) -> None:
        """A file no longer present on disk at all — removes every chunk `code_embeddings` has for
        it, not just the tail (`delete_chunks_from_index`'s job for a file that merely shrank)."""
        await self._session.execute(
            delete(CodeEmbeddingModel).where(
                CodeEmbeddingModel.workspace_id == workspace_id,
                CodeEmbeddingModel.file_path == file_path,
            )
        )
        await self._session.flush()

    async def get_file_index_metadata(self, *, workspace_id: UUID) -> dict[str, tuple[float, int]]:
        """`file_path -> (mtime, size_bytes)` for every file `indexed_files` has a row for — the
        indexer's file-level pre-check (`infrastructure/rag/indexer.py`) compares this against a
        fresh `os.stat()` per file *before* reading/chunking it, skipping both entirely for a file
        whose real, current stat matches what's recorded here. Fetched once per index run (like
        `get_content_hashes()` is fetched once per *file*), not per file, since this covers the
        whole workspace in one query."""
        result = await self._session.execute(
            select(IndexedFileModel.file_path, IndexedFileModel.mtime, IndexedFileModel.size_bytes).where(
                IndexedFileModel.workspace_id == workspace_id
            )
        )
        return {row.file_path: (row.mtime, row.size_bytes) for row in result}

    async def upsert_file_index_metadata(
        self, *, workspace_id: UUID, file_path: str, mtime: float, size_bytes: int
    ) -> None:
        stmt = (
            pg_insert(IndexedFileModel)
            .values(
                id=uuid4(),
                workspace_id=workspace_id,
                file_path=file_path,
                mtime=mtime,
                size_bytes=size_bytes,
            )
            .on_conflict_do_update(
                index_elements=["workspace_id", "file_path"],
                set_={"mtime": mtime, "size_bytes": size_bytes},
            )
        )
        await self._session.execute(stmt)
        await self._session.flush()

    async def delete_file_index_metadata(self, *, workspace_id: UUID, file_path: str) -> None:
        """Paired with `delete_for_file()` — a file removed from disk should lose its stat cache
        too, or a file later re-created at the exact same path/mtime/size (rare, but possible
        after a `git checkout` of an old commit) would be wrongly skipped as "unchanged" even
        though its `code_embeddings` rows are long gone."""
        await self._session.execute(
            delete(IndexedFileModel).where(
                IndexedFileModel.workspace_id == workspace_id,
                IndexedFileModel.file_path == file_path,
            )
        )
        await self._session.flush()
