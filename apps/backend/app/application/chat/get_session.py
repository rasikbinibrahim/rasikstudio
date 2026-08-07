from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.core.errors import ChatError
from app.domain.models.chat import ChatSession, Message
from app.domain.ports.chat_repository import ChatRepository


@dataclass(frozen=True, slots=True)
class ChatSessionWithHistory:
    session: ChatSession
    history: list[Message]


class GetChatSessionUseCase:
    """Loads a session plus its message history in one round trip — every real caller (the
    `GET /sessions/{id}` endpoint, `send_message.py`'s context builder) needs both, never just
    the bare session row."""

    def __init__(self, chat_repo: ChatRepository) -> None:
        self._chat_repo = chat_repo

    async def execute(
        self, session_id: UUID, user_id: UUID, *, history_limit: int = 100
    ) -> ChatSessionWithHistory:
        session = await self._chat_repo.get_session(session_id)
        if session is None or session.user_id != user_id:
            # Same don't-leak-existence principle as WorkspaceError/AgentError: a session that
            # exists but belongs to someone else 404s, not 403.
            raise ChatError("Chat session not found")
        history = await self._chat_repo.get_history(session_id, limit=history_limit)
        return ChatSessionWithHistory(session=session, history=history)
