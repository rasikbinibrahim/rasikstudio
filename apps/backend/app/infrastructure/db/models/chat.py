from __future__ import annotations

from datetime import datetime
from typing import Any, cast
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.domain.models.chat import ChatSession, FinishReason, Message, MessageRole
from app.infrastructure.db.models.base import Base, TimestampMixin


class ChatSessionModel(Base, TimestampMixin):
    __tablename__ = "chat_sessions"
    __table_args__ = (
        Index("idx_chat_sessions_workspace", "workspace_id", "created_at"),
        Index("idx_chat_sessions_user", "user_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String, default="New Chat")
    model: Mapped[str] = mapped_column(String)
    system_prompt: Mapped[str | None] = mapped_column(Text)

    def to_domain(self) -> ChatSession:
        return ChatSession(
            id=self.id,
            workspace_id=self.workspace_id,
            user_id=self.user_id,
            title=self.title,
            model=self.model,
            system_prompt=self.system_prompt,
            created_at=self.created_at,
            updated_at=self.updated_at,
        )


class MessageModel(Base):
    __tablename__ = "messages"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant', 'system', 'tool')", name="ck_messages_role"),
        Index("idx_messages_session", "session_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    session_id: Mapped[UUID] = mapped_column(ForeignKey("chat_sessions.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String)
    content: Mapped[str | None] = mapped_column(Text)
    tool_calls: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    tool_call_id: Mapped[str | None] = mapped_column(String)
    token_count: Mapped[int | None] = mapped_column(Integer)
    finish_reason: Mapped[str | None] = mapped_column(String)
    model: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    def to_domain(self) -> Message:
        return Message(
            id=self.id,
            session_id=self.session_id,
            role=cast(MessageRole, self.role),
            content=self.content,
            tool_calls=self.tool_calls,
            tool_call_id=self.tool_call_id,
            token_count=self.token_count,
            finish_reason=cast(FinishReason | None, self.finish_reason),
            model=self.model,
            created_at=self.created_at,
        )
