from __future__ import annotations

from uuid import UUID

from sqlalchemy import select

from app.domain.models.chat import ChatSession, Message
from app.infrastructure.db.models.chat import ChatSessionModel, MessageModel
from app.infrastructure.db.repositories.base import BaseRepository


class ChatRepository(BaseRepository[ChatSessionModel]):
    model = ChatSessionModel

    async def create_session(self, session: ChatSession) -> ChatSession:
        instance = ChatSessionModel(
            id=session.id,
            workspace_id=session.workspace_id,
            user_id=session.user_id,
            title=session.title,
            model=session.model,
            system_prompt=session.system_prompt,
        )
        await self.add(instance)
        return instance.to_domain()

    async def get_session(self, session_id: UUID) -> ChatSession | None:
        instance = await self.get(session_id)
        return instance.to_domain() if instance else None

    async def list_sessions(self, workspace_id: UUID) -> list[ChatSession]:
        result = await self._session.execute(
            select(ChatSessionModel)
            .where(ChatSessionModel.workspace_id == workspace_id)
            .order_by(ChatSessionModel.created_at.desc())
        )
        return [row.to_domain() for row in result.scalars()]

    async def delete_session(self, session_id: UUID) -> None:
        instance = await self.get(session_id)
        if instance is not None:
            await self.remove(instance)

    async def append_message(self, message: Message) -> Message:
        instance = MessageModel(
            id=message.id,
            session_id=message.session_id,
            role=message.role,
            content=message.content,
            tool_calls=message.tool_calls,
            tool_call_id=message.tool_call_id,
            token_count=message.token_count,
            finish_reason=message.finish_reason,
            model=message.model,
        )
        self._session.add(instance)
        await self._session.flush()
        return instance.to_domain()

    async def get_history(self, session_id: UUID, *, limit: int = 100) -> list[Message]:
        result = await self._session.execute(
            select(MessageModel)
            .where(MessageModel.session_id == session_id)
            .order_by(MessageModel.created_at.asc())
            .limit(limit)
        )
        return [row.to_domain() for row in result.scalars()]
