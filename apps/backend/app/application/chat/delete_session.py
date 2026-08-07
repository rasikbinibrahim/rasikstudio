from __future__ import annotations

from uuid import UUID

from app.core.errors import ChatError
from app.domain.ports.chat_repository import ChatRepository


class DeleteChatSessionUseCase:
    def __init__(self, chat_repo: ChatRepository) -> None:
        self._chat_repo = chat_repo

    async def execute(self, session_id: UUID, user_id: UUID) -> None:
        session = await self._chat_repo.get_session(session_id)
        if session is None or session.user_id != user_id:
            raise ChatError("Chat session not found")
        await self._chat_repo.delete_session(session_id)
