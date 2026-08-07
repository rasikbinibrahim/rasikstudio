from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

ApiKeyProvider = Literal["openai", "anthropic", "gemini"]


@dataclass(frozen=True, slots=True)
class Workspace:
    id: UUID
    user_id: UUID
    name: str
    root_path: str
    settings: dict[str, Any]
    last_opened_at: datetime | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class WorkspaceApiKey:
    id: UUID
    workspace_id: UUID
    provider: ApiKeyProvider
    encrypted_key: str
    key_hint: str
    created_at: datetime
