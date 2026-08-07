from __future__ import annotations

from typing import Protocol
from uuid import UUID

from app.domain.models.chat import ChatSession, Message


class ChatRepository(Protocol):
    async def create_session(self, session: ChatSession) -> ChatSession: ...

    async def get_session(self, session_id: UUID) -> ChatSession | None: ...

    async def list_sessions(self, workspace_id: UUID) -> list[ChatSession]: ...

    async def delete_session(self, session_id: UUID) -> None: ...

    async def append_message(self, message: Message) -> Message: ...

    async def get_history(self, session_id: UUID, *, limit: int = 100) -> list[Message]: ...
