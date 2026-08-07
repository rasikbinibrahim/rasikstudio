from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import select

from app.domain.ports.vector_store import VectorSearchResult
from app.infrastructure.db.models.embedding import WorkspaceMemoryModel
from app.infrastructure.db.repositories.base import BaseRepository

# `VectorStore.search`/`upsert`/`delete` take a required `workspace_id: UUID` — global memories
# (`workspace_id IS NULL`, MEMORY_SYSTEM.md §9) fall outside this Protocol's shape and aren't
# reachable through it yet. No use case needs global-memory retrieval in this phase; tracked in
# TASKS.md rather than widening the shared Protocol for a feature nothing calls yet.


class MemoryRepository(BaseRepository[WorkspaceMemoryModel]):
    """Implements `VectorStore` against `workspace_memories`. Unlike `EmbeddingRepository`, upsert
    here always inserts — memories aren't chunk-keyed, so "is this a duplicate of an existing
    memory" is a use-case-layer (Phase 8 memory extraction) decision, not a repository one."""

    model = WorkspaceMemoryModel

    async def upsert(
        self, *, workspace_id: UUID, content: str, embedding: list[float], metadata: dict[str, object]
    ) -> UUID:
        instance = WorkspaceMemoryModel(
            id=uuid4(),
            workspace_id=workspace_id,
            content=content,
            memory_type=metadata["memory_type"],
            source=metadata["source"],
            source_id=metadata.get("source_id"),
            embedding=embedding,
        )
        await self.add(instance)
        return instance.id

    async def search(
        self, *, workspace_id: UUID, query_embedding: list[float], top_k: int = 5
    ) -> list[VectorSearchResult]:
        distance = WorkspaceMemoryModel.embedding.cosine_distance(query_embedding)
        stmt = (
            select(WorkspaceMemoryModel, distance.label("distance"))
            .where(WorkspaceMemoryModel.workspace_id == workspace_id)
            .order_by(distance)
            .limit(top_k)
        )
        rows = list(await self._session.execute(stmt))

        # MEMORY_SYSTEM.md §4.3: retrieval also refreshes access metadata for what it returns.
        now = datetime.now(UTC)
        for row in rows:
            row.WorkspaceMemoryModel.last_accessed_at = now
            row.WorkspaceMemoryModel.access_count += 1
        await self._session.flush()

        return [
            VectorSearchResult(
                id=row.WorkspaceMemoryModel.id,
                content=row.WorkspaceMemoryModel.content,
                distance=row.distance,
                metadata={
                    "memory_type": row.WorkspaceMemoryModel.memory_type,
                    "source": row.WorkspaceMemoryModel.source,
                    "access_count": row.WorkspaceMemoryModel.access_count,
                },
            )
            for row in rows
        ]

    async def delete(self, *, workspace_id: UUID, entry_id: UUID) -> None:
        instance = await self.get(entry_id)
        if instance is not None and instance.workspace_id == workspace_id:
            await self.remove(instance)
