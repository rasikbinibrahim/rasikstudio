from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

MessageRole = Literal["user", "assistant", "system", "tool"]
FinishReason = Literal["stop", "tool_calls", "length", "error"]


@dataclass(frozen=True, slots=True)
class ChatSession:
    id: UUID
    workspace_id: UUID
    user_id: UUID
    title: str
    model: str
    system_prompt: str | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class Message:
    id: UUID
    session_id: UUID
    role: MessageRole
    content: str | None
    tool_calls: list[dict[str, Any]] | None
    tool_call_id: str | None
    token_count: int | None
    finish_reason: FinishReason | None
    model: str | None
    created_at: datetime
