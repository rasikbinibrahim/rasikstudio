from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import cast
from uuid import UUID, uuid4

import structlog
from redis.asyncio import Redis

from app.api.ws.event_types import StreamChunkEvent, StreamEndEvent
from app.api.ws.publisher import publish_event
from app.application.chat.context_builder import ActiveFileContext, build_chat_context
from app.core.background import fire_and_forget
from app.core.config import get_settings
from app.core.errors import ChatError
from app.domain.models.chat import ChatSession, FinishReason
from app.domain.models.chat import Message as DomainMessage
from app.domain.ports.chat_repository import ChatRepository
from app.infrastructure.ai.embedding_service import EmbeddingService
from app.infrastructure.ai.model_router import ModelRouter, load_fallback_chains
from app.infrastructure.ai.providers import ai_providers
from app.infrastructure.db.repositories.chat_repository import ChatRepository as ConcreteChatRepository
from app.infrastructure.db.repositories.embedding_repository import EmbeddingRepository
from app.infrastructure.db.session import AsyncSessionLocal

logger = structlog.get_logger("application.chat.send_message")


@dataclass(frozen=True, slots=True)
class SendMessageRequest:
    session_id: UUID
    user_id: UUID
    content: str
    active_file: ActiveFileContext | None = None


class SendMessageUseCase:
    """Persists the user's message and returns immediately (per `phase-10-ai-chat.md`'s streaming
    flow: `POST .../messages` creates the `Message` record and *triggers* streaming, it doesn't
    wait for it). Only `chat_repo` is request-scoped — the AI reply itself streams in an
    in-process background task (`stream_chat_reply()` below) that builds its own DB session,
    Redis client, and `ModelRouter` rather than reusing this use case's request-scoped ones,
    which FastAPI's dependency injection tears down as soon as the HTTP response is sent (a real
    bug caught by this phase's own integration test — see that test file's git history / the
    Decisions Log — not a hypothetical concern). Same reasoning as `AGENT_FRAMEWORK.md` §10's
    `execute_agent_task`, which the background function below mirrors structurally."""

    def __init__(self, chat_repo: ChatRepository) -> None:
        self._chat_repo = chat_repo

    async def execute(self, request: SendMessageRequest) -> DomainMessage:
        session = await self._chat_repo.get_session(request.session_id)
        if session is None or session.user_id != request.user_id:
            raise ChatError("Chat session not found")

        history = await self._chat_repo.get_history(request.session_id)

        user_message = await self._chat_repo.append_message(
            DomainMessage(
                id=uuid4(),
                session_id=request.session_id,
                role="user",
                content=request.content,
                tool_calls=None,
                tool_call_id=None,
                token_count=None,
                finish_reason=None,
                model=None,
                created_at=datetime.now(UTC),
            )
        )

        fire_and_forget(
            stream_chat_reply(
                session=session,
                history=history,
                user_message=request.content,
                active_file=request.active_file,
            )
        )

        return user_message


async def stream_chat_reply(
    *,
    session: ChatSession,
    history: list[DomainMessage],
    user_message: str,
    active_file: ActiveFileContext | None,
) -> None:
    """The one place that actually builds a `ModelRouter` + `EmbeddingService` + repositories +
    Redis client and streams a chat reply to completion — a free function (not a method holding
    request-scoped dependencies) specifically so it can open its own `AsyncSessionLocal` session
    and its own Redis client, both independent of the FastAPI request that triggered it. Mirrors
    `agent_factory.execute_agent_task`'s structure for the same reason."""
    settings = get_settings()
    fallback_chains = load_fallback_chains(settings.fallback_chains_path)
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        async with AsyncSessionLocal() as db_session:
            chat_repo = ConcreteChatRepository(db_session)
            embedding_repo = EmbeddingRepository(db_session)
            embedding_service = EmbeddingService(ai_providers, fallback_chains)
            model_router = ModelRouter(
                ai_providers, fallback_chains, redis, settings.ai_response_cache_ttl_seconds
            )

            assistant_message_id = uuid4()
            accumulated = ""
            finish_reason = "error"
            try:
                context = await build_chat_context(
                    system_prompt=session.system_prompt,
                    workspace_id=session.workspace_id,
                    active_file=active_file,
                    history=history,
                    user_message=user_message,
                    embedding_service=embedding_service,
                    embedding_repo=embedding_repo,
                )
                async for chunk in model_router.stream(context, session.model):
                    if chunk.delta:
                        accumulated += chunk.delta
                        await publish_event(
                            redis,
                            StreamChunkEvent(
                                workspace_id=session.workspace_id,
                                user_id=session.user_id,
                                timestamp=datetime.now(UTC),
                                message_id=assistant_message_id,
                                delta=chunk.delta,
                            ),
                        )
                    if chunk.finish_reason:
                        finish_reason = chunk.finish_reason
            except Exception:
                logger.exception("chat_stream_failed", session_id=str(session.id))
                finish_reason = "error"

            await chat_repo.append_message(
                DomainMessage(
                    id=assistant_message_id,
                    session_id=session.id,
                    role="assistant",
                    content=accumulated or None,
                    tool_calls=None,
                    tool_call_id=None,
                    # Streaming responses don't report token usage the way
                    # ModelRouter.complete()'s CompletionResult does (StreamChunk has no usage
                    # field) — recording None here is honest about that gap rather than
                    # fabricating a count. See TASKS.md for the follow-up.
                    token_count=None,
                    finish_reason=cast(FinishReason, finish_reason),
                    model=session.model,
                    created_at=datetime.now(UTC),
                )
            )
            await db_session.commit()
            await publish_event(
                redis,
                StreamEndEvent(
                    workspace_id=session.workspace_id,
                    user_id=session.user_id,
                    timestamp=datetime.now(UTC),
                    message_id=assistant_message_id,
                    finish_reason=finish_reason,
                    usage={},
                ),
            )
    finally:
        await redis.aclose()
