from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True, slots=True)
class CodeEmbedding:
    id: UUID
    workspace_id: UUID
    file_path: str
    chunk_index: int
    content: str
    embedding: list[float] | None
    language: str | None
    start_line: int | None
    end_line: int | None
    content_hash: str
    created_at: datetime
