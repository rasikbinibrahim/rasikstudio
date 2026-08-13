from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.application.chat import send_message as send_message_module
from app.application.chat.send_message import SendMessageRequest, SendMessageUseCase
from app.core.errors import ChatError
from app.domain.models.chat import ChatSession
from app.domain.ports.ai_provider import StreamChunk


def _session(session_id, user_id, *, model="gpt-4o-mini") -> ChatSession:
    now = datetime.now(UTC)
    return ChatSession(
        id=session_id,
        workspace_id=uuid4(),
        user_id=user_id,
        title="New Chat",
        model=model,
        system_prompt=None,
        created_at=now,
        updated_at=now,
    )


class FakeChatRepo:
    """Stands in for both the request-scoped repo `SendMessageUseCase` takes directly and the
    fresh one `stream_chat_reply()` builds itself — `_patch_background_infra` below points the
    latter at this same instance so a test can assert on one `appended` list."""

    def __init__(self, session=None, history=None) -> None:
        self._session = session
        self._history = history or []
        self.appended = []

    async def get_session(self, session_id):
        return self._session if self._session and self._session.id == session_id else None

    async def get_history(self, session_id, *, limit=100):
        return self._history

    async def append_message(self, message):
        self.appended.append(message)
        return message


class FakeDbSession:
    async def commit(self):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class FakeRedis:
    def __init__(self) -> None:
        self.published: list[tuple[str, str]] = []
        self.closed = False

    async def publish(self, channel, message) -> None:
        self.published.append((channel, message))

    async def aclose(self) -> None:
        self.closed = True


class FakeModelRouter:
    def __init__(self, chunks=None, error=None) -> None:
        self._chunks = chunks or []
        self._error = error
        self.stream_calls = []

    def __call__(self, *args, **kwargs):  # stands in for the `ModelRouter` class itself
        return self

    def stream(self, messages, model):
        self.stream_calls.append((messages, model))
        return self._generate()

    def count_tokens(self, messages, model):
        return sum(len(m.content or "") for m in messages)

    async def _generate(self):
        for chunk in self._chunks:
            yield chunk
        if self._error is not None:
            raise self._error


def _patch_background_infra(
    monkeypatch, *, chat_repo: FakeChatRepo, router: FakeModelRouter, redis: FakeRedis
):
    """`stream_chat_reply()` deliberately builds its own DB session / Redis client / `ModelRouter`
    rather than reusing anything request-scoped (see that function's docstring for why — a real
    bug this design avoids). Testing it therefore means patching the exact same module-level names
    `tests/integration/agents/test_agent_execution.py` patches on `agent_factory_module` for the
    structurally identical `execute_agent_task()` — inject at the boundary, keep everything else
    real."""
    monkeypatch.setattr(send_message_module, "AsyncSessionLocal", lambda: FakeDbSession())
    monkeypatch.setattr(send_message_module, "ConcreteChatRepository", lambda db_session: chat_repo)
    # Patching the module-local `Redis` name (not `redis.asyncio.Redis` itself) so this doesn't
    # leak into anything else importing the real class.
    monkeypatch.setattr(send_message_module, "Redis", SimpleNamespace(from_url=lambda *a, **k: redis))
    monkeypatch.setattr(send_message_module, "ModelRouter", router)
    monkeypatch.setattr(send_message_module, "EmbeddingService", lambda *a, **k: _NullEmbeddingService())
    monkeypatch.setattr(
        send_message_module, "EmbeddingRepository", lambda db_session: _NullEmbeddingRepo()
    )


class _NullEmbeddingService:
    async def embed(self, texts):
        return [[0.0] for _ in texts]


class _NullEmbeddingRepo:
    async def search(self, *, workspace_id, query_embedding, top_k=5):
        return []


class TestSendMessageUseCase:
    async def test_raises_for_a_session_that_does_not_exist(self) -> None:
        repo = FakeChatRepo(session=None)
        with pytest.raises(ChatError):
            await SendMessageUseCase(repo).execute(
                SendMessageRequest(session_id=uuid4(), user_id=uuid4(), content="hi")
            )
        assert repo.appended == []

    async def test_raises_for_a_session_owned_by_a_different_user(self) -> None:
        session_id = uuid4()
        repo = FakeChatRepo(session=_session(session_id, uuid4()))
        with pytest.raises(ChatError):
            await SendMessageUseCase(repo).execute(
                SendMessageRequest(session_id=session_id, user_id=uuid4(), content="hi")
            )
        assert repo.appended == []

    async def test_persists_the_user_message_and_returns_immediately(self, monkeypatch) -> None:
        session_id, user_id = uuid4(), uuid4()
        repo = FakeChatRepo(session=_session(session_id, user_id))
        _patch_background_infra(monkeypatch, chat_repo=repo, router=FakeModelRouter(), redis=FakeRedis())

        result = await SendMessageUseCase(repo).execute(
            SendMessageRequest(session_id=session_id, user_id=user_id, content="how do I fix this bug?")
        )

        assert result.role == "user"
        assert result.content == "how do I fix this bug?"
        # Only the user message exists so far — the assistant reply streams in the background and
        # hasn't run yet (fire_and_forget schedules it but this coroutine never yielded to it).
        assert repo.appended == [result]

    async def test_streams_chunks_over_redis_and_persists_the_assembled_reply(self, monkeypatch) -> None:
        session_id, user_id = uuid4(), uuid4()
        session = _session(session_id, user_id, model="claude-sonnet-4-5")
        repo = FakeChatRepo(session=session)
        redis = FakeRedis()
        router = FakeModelRouter(
            chunks=[
                StreamChunk(delta="Hel", finish_reason=None, tool_calls=None),
                StreamChunk(delta="lo", finish_reason="stop", tool_calls=None),
            ]
        )
        _patch_background_infra(monkeypatch, chat_repo=repo, router=router, redis=redis)

        await SendMessageUseCase(repo).execute(
            SendMessageRequest(session_id=session_id, user_id=user_id, content="hi")
        )
        await _wait_for_second_message(repo)

        assistant_message = repo.appended[1]
        assert assistant_message.role == "assistant"
        assert assistant_message.content == "Hello"
        assert assistant_message.finish_reason == "stop"
        assert assistant_message.model == "claude-sonnet-4-5"
        # `FakeModelRouter.count_tokens()` counts raw characters — "Hello" is 5, a real computed
        # value from `ModelRouter.count_tokens()` post-stream, not a guess or a hardcoded None.
        assert assistant_message.token_count == 5

        assert router.stream_calls[0][1] == "claude-sonnet-4-5"
        assert len(redis.published) == 3  # 2 stream_chunk + 1 stream_end
        assert '"type":"stream_chunk"' in redis.published[0][1]
        assert '"delta":"Hel"' in redis.published[0][1]
        stream_end_payload = redis.published[-1][1]
        assert '"type":"stream_end"' in stream_end_payload
        assert '"completion_tokens":5' in stream_end_payload
        assert redis.closed is True

    async def test_a_streaming_failure_still_persists_a_partial_reply_with_error_finish_reason(
        self, monkeypatch
    ) -> None:
        session_id, user_id = uuid4(), uuid4()
        session = _session(session_id, user_id)
        repo = FakeChatRepo(session=session)
        router = FakeModelRouter(
            chunks=[StreamChunk(delta="partial reply", finish_reason=None, tool_calls=None)],
            error=RuntimeError("provider crashed mid-stream"),
        )
        _patch_background_infra(monkeypatch, chat_repo=repo, router=router, redis=FakeRedis())

        await SendMessageUseCase(repo).execute(
            SendMessageRequest(session_id=session_id, user_id=user_id, content="hi")
        )
        await _wait_for_second_message(repo)  # must not raise despite the provider crash

        assistant_message = repo.appended[1]
        assert assistant_message.content == "partial reply"
        assert assistant_message.finish_reason == "error"
        # A partial reply still has real content — usage is still computed for whatever streamed
        # before the crash, not silently dropped just because the stream itself errored.
        assert assistant_message.token_count == len("partial reply")


async def _wait_for_second_message(repo: FakeChatRepo) -> None:
    async def _poll():
        while len(repo.appended) < 2:
            await asyncio.sleep(0.01)

    await asyncio.wait_for(_poll(), timeout=1)
