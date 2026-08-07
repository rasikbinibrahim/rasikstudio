from __future__ import annotations

from uuid import UUID

from app.domain.models.chat import ChatSession
from app.domain.ports.chat_repository import ChatRepository


class ListChatSessionsUseCase:
    def __init__(self, chat_repo: ChatRepository) -> None:
        self._chat_repo = chat_repo

    async def execute(self, workspace_id: UUID) -> list[ChatSession]:
        return await self._chat_repo.list_sessions(workspace_id)
