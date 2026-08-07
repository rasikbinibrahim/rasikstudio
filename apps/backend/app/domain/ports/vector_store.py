from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
from uuid import UUID


@dataclass(frozen=True, slots=True)
class VectorSearchResult:
    id: UUID
    content: str
    distance: float
    metadata: dict[str, object]


class VectorStore(Protocol):
    """Same shape for both pgvector-backed tables (`code_embeddings`, `workspace_memories`) —
    `infrastructure/db/repositories/embedding_repository.py` and `memory_repository.py` (Phase 5)
    each implement this against their own table rather than sharing one generic implementation,
    since the two tables' non-vector columns differ (RAG_SYSTEM.md §3.5's `content_hash`
    dedup-on-upsert vs. MEMORY_SYSTEM.md's access-count decay tracking)."""

    async def upsert(
        self,
        *,
        workspace_id: UUID,
        content: str,
        embedding: list[float],
        metadata: dict[str, object],
    ) -> UUID: ...

    async def search(
        self,
        *,
        workspace_id: UUID,
        query_embedding: list[float],
        top_k: int = 5,
    ) -> list[VectorSearchResult]: ...

    async def delete(self, *, workspace_id: UUID, entry_id: UUID) -> None: ...
