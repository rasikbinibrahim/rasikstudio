from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel
from starlette import status

from app.application.chat.context_builder import ActiveFileContext
from app.application.chat.create_session import CreateChatSessionRequest, CreateChatSessionUseCase
from app.application.chat.delete_session import DeleteChatSessionUseCase
from app.application.chat.get_session import GetChatSessionUseCase
from app.application.chat.list_sessions import ListChatSessionsUseCase
from app.application.chat.send_message import SendMessageRequest, SendMessageUseCase
from app.core.dependencies import CurrentUserDep, DbDep
from app.core.errors import ChatError
from app.domain.models.chat import ChatSession, Message
from app.infrastructure.db.repositories.chat_repository import ChatRepository
from app.infrastructure.db.repositories.workspace_repository import WorkspaceRepository

router = APIRouter(prefix="/chat", tags=["chat"])

_DEFAULT_HISTORY_LIMIT = 100


class ChatSessionSchema(BaseModel):
    id: UUID
    workspace_id: UUID
    title: str
    model: str
    system_prompt: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_domain(cls, session: ChatSession) -> ChatSessionSchema:
        return cls(
            id=session.id,
            workspace_id=session.workspace_id,
            title=session.title,
            model=session.model,
            system_prompt=session.system_prompt,
            created_at=session.created_at,
            updated_at=session.updated_at,
        )


class ChatSessionListSchema(BaseModel):
    items: list[ChatSessionSchema]
    total: int


class MessageSchema(BaseModel):
    id: UUID
    session_id: UUID
    role: str
    content: str | None
    finish_reason: str | None
    model: str | None
    created_at: datetime

    @classmethod
    def from_domain(cls, message: Message) -> MessageSchema:
        return cls(
            id=message.id,
            session_id=message.session_id,
            role=message.role,
            content=message.content,
            finish_reason=message.finish_reason,
            model=message.model,
            created_at=message.created_at,
        )


class ChatSessionDetailSchema(BaseModel):
    session: ChatSessionSchema
    history: list[MessageSchema]


class CreateChatSessionRequestSchema(BaseModel):
    workspace_id: UUID
    model: str
    title: str = "New Chat"
    system_prompt: str | None = None


class ActiveFileSchema(BaseModel):
    path: str
    content: str


class SendMessageRequestSchema(BaseModel):
    content: str
    active_file: ActiveFileSchema | None = None


@router.post("/sessions", status_code=status.HTTP_201_CREATED, response_model=ChatSessionSchema)
async def create_session(
    body: CreateChatSessionRequestSchema, user: CurrentUserDep, db: DbDep
) -> ChatSessionSchema:
    workspace = await WorkspaceRepository(db).get_by_id(body.workspace_id)
    if workspace is None or workspace.user_id != user.id:
        raise ChatError("Workspace not found", code="workspace_not_found")

    session = await CreateChatSessionUseCase(ChatRepository(db)).execute(
        CreateChatSessionRequest(
            workspace_id=body.workspace_id,
            user_id=user.id,
            title=body.title,
            model=body.model,
            system_prompt=body.system_prompt,
        )
    )
    return ChatSessionSchema.from_domain(session)


@router.get("/sessions", response_model=ChatSessionListSchema)
async def list_sessions(workspace_id: UUID, user: CurrentUserDep, db: DbDep) -> ChatSessionListSchema:
    workspace = await WorkspaceRepository(db).get_by_id(workspace_id)
    if workspace is None or workspace.user_id != user.id:
        raise ChatError("Workspace not found", code="workspace_not_found")

    sessions = await ListChatSessionsUseCase(ChatRepository(db)).execute(workspace_id)
    items = [ChatSessionSchema.from_domain(s) for s in sessions]
    return ChatSessionListSchema(items=items, total=len(items))


@router.get("/sessions/{session_id}", response_model=ChatSessionDetailSchema)
async def get_session(session_id: UUID, user: CurrentUserDep, db: DbDep) -> ChatSessionDetailSchema:
    result = await GetChatSessionUseCase(ChatRepository(db)).execute(
        session_id, user.id, history_limit=_DEFAULT_HISTORY_LIMIT
    )
    return ChatSessionDetailSchema(
        session=ChatSessionSchema.from_domain(result.session),
        history=[MessageSchema.from_domain(m) for m in result.history],
    )


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: UUID, user: CurrentUserDep, db: DbDep) -> None:
    await DeleteChatSessionUseCase(ChatRepository(db)).execute(session_id, user.id)


@router.post(
    "/sessions/{session_id}/messages", status_code=status.HTTP_201_CREATED, response_model=MessageSchema
)
async def send_message(
    session_id: UUID, body: SendMessageRequestSchema, user: CurrentUserDep, db: DbDep
) -> MessageSchema:
    active_file = (
        ActiveFileContext(path=body.active_file.path, content=body.active_file.content)
        if body.active_file is not None
        else None
    )
    message = await SendMessageUseCase(ChatRepository(db)).execute(
        SendMessageRequest(
            session_id=session_id, user_id=user.id, content=body.content, active_file=active_file
        )
    )
    return MessageSchema.from_domain(message)
