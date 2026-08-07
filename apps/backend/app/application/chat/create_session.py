from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid4

from app.domain.models.chat import ChatSession
from app.domain.ports.chat_repository import ChatRepository


@dataclass(frozen=True, slots=True)
class CreateChatSessionRequest:
    workspace_id: UUID
    user_id: UUID
    title: str
    model: str
    system_prompt: str | None = None


class CreateChatSessionUseCase:
    def __init__(self, chat_repo: ChatRepository) -> None:
        self._chat_repo = chat_repo

    async def execute(self, request: CreateChatSessionRequest) -> ChatSession:
        now = datetime.now(UTC)
        return await self._chat_repo.create_session(
            ChatSession(
                id=uuid4(),
                workspace_id=request.workspace_id,
                user_id=request.user_id,
                title=request.title,
                model=request.model,
                system_prompt=request.system_prompt,
                created_at=now,
                updated_at=now,
            )
        )
