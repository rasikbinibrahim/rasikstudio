from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.domain.ports.vector_store import VectorSearchResult
from app.infrastructure.db.models.embedding import CodeEmbeddingModel
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
