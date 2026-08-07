from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

AuthProvider = Literal["local", "github", "google"]


@dataclass(frozen=True, slots=True)
class User:
    id: UUID
    email: str
    name: str
    avatar_url: str | None
    auth_provider: AuthProvider
    hashed_password: str | None
    is_active: bool
    settings: dict[str, Any]
    created_at: datetime
    updated_at: datetime
