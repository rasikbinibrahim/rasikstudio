from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID

MemoryType = Literal["architecture", "convention", "bug", "dependency", "location", "environment"]
MemorySource = Literal["chat", "agent", "manual"]


@dataclass(frozen=True, slots=True)
class WorkspaceMemory:
    """`workspace_id` is nullable — per MEMORY_SYSTEM.md §4 ("Global memories are stored with
    workspace_id = NULL"), a memory can apply across every workspace rather than just one."""

    id: UUID
    workspace_id: UUID | None
    content: str
    memory_type: MemoryType
    source: MemorySource
    source_id: UUID | None
    embedding: list[float] | None
    created_at: datetime
    last_accessed_at: datetime
    access_count: int
