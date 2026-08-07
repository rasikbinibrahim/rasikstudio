from __future__ import annotations

from datetime import datetime
from typing import cast
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.models.embedding import CodeEmbedding
from app.domain.models.memory import MemorySource, MemoryType, WorkspaceMemory
from app.infrastructure.db.models.base import Base

EMBEDDING_DIMENSIONS = 768  # nomic-embed-text — see docs/adr/0010-embedding-model-nomic-768d.md


class CodeEmbeddingModel(Base):
    __tablename__ = "code_embeddings"
    __table_args__ = (
        UniqueConstraint("workspace_id", "file_path", "chunk_index", name="uq_code_embeddings_chunk"),
        Index("idx_embeddings_workspace_file", "workspace_id", "file_path"),
        Index(
            "idx_embeddings_vector",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    file_path: Mapped[str] = mapped_column(Text)
    chunk_index: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIMENSIONS))
    language: Mapped[str | None] = mapped_column(String)
    start_line: Mapped[int | None] = mapped_column(Integer)
    end_line: Mapped[int | None] = mapped_column(Integer)
    content_hash: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    def to_domain(self) -> CodeEmbedding:
        return CodeEmbedding(
            id=self.id,
            workspace_id=self.workspace_id,
            file_path=self.file_path,
            chunk_index=self.chunk_index,
            content=self.content,
            embedding=list(self.embedding) if self.embedding is not None else None,
            language=self.language,
            start_line=self.start_line,
            end_line=self.end_line,
            content_hash=self.content_hash,
            created_at=self.created_at,
        )


class WorkspaceMemoryModel(Base):
    __tablename__ = "workspace_memories"
    __table_args__ = (
        Index("idx_memories_workspace", "workspace_id"),
        Index(
            "idx_memories_vector",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    # Nullable: NULL means a global memory, visible across every workspace (MEMORY_SYSTEM.md §9).
    workspace_id: Mapped[UUID | None] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    content: Mapped[str] = mapped_column(Text)
    memory_type: Mapped[str] = mapped_column(String)
    source: Mapped[str] = mapped_column(String)
    source_id: Mapped[UUID | None] = mapped_column()
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIMENSIONS))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    last_accessed_at: Mapped[datetime] = mapped_column(server_default=func.now())
    access_count: Mapped[int] = mapped_column(Integer, default=0)

    def to_domain(self) -> WorkspaceMemory:
        return WorkspaceMemory(
            id=self.id,
            workspace_id=self.workspace_id,
            content=self.content,
            memory_type=cast(MemoryType, self.memory_type),
            source=cast(MemorySource, self.source),
            source_id=self.source_id,
            embedding=list(self.embedding) if self.embedding is not None else None,
            created_at=self.created_at,
            last_accessed_at=self.last_accessed_at,
            access_count=self.access_count,
        )
