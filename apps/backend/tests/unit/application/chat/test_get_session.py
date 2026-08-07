from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.application.chat.get_session import GetChatSessionUseCase
from app.core.errors import ChatError
from app.domain.models.chat import ChatSession, Message


def _session(session_id, user_id) -> ChatSession:
    now = datetime.now(UTC)
    return ChatSession(
        id=session_id,
        workspace_id=uuid4(),
        user_id=user_id,
        title="New Chat",
        model="gpt-4o-mini",
        system_prompt=None,
        created_at=now,
        updated_at=now,
    )


def _message(session_id) -> Message:
    return Message(
        id=uuid4(),
        session_id=session_id,
        role="user",
        content="hello",
        tool_calls=None,
        tool_call_id=None,
        token_count=None,
        finish_reason=None,
        model=None,
        created_at=datetime.now(UTC),
    )


class FakeChatRepo:
    def __init__(self, session=None, history=None) -> None:
        self._session = session
        self._history = history or []
        self.history_calls = []

    async def get_session(self, session_id):
        return self._session if self._session and self._session.id == session_id else None

    async def get_history(self, session_id, *, limit=100):
        self.history_calls.append((session_id, limit))
        return self._history


class TestGetChatSessionUseCase:
    async def test_returns_the_session_and_its_history(self) -> None:
        session_id, user_id = uuid4(), uuid4()
        session = _session(session_id, user_id)
        history = [_message(session_id)]
        repo = FakeChatRepo(session=session, history=history)

        result = await GetChatSessionUseCase(repo).execute(session_id, user_id)

        assert result.session == session
        assert result.history == history
        assert repo.history_calls == [(session_id, 100)]

    async def test_raises_for_a_session_that_does_not_exist(self) -> None:
        repo = FakeChatRepo(session=None)
        with pytest.raises(ChatError):
            await GetChatSessionUseCase(repo).execute(uuid4(), uuid4())

    async def test_raises_for_a_session_owned_by_a_different_user(self) -> None:
        session_id = uuid4()
        session = _session(session_id, uuid4())
        repo = FakeChatRepo(session=session)

        with pytest.raises(ChatError):
            await GetChatSessionUseCase(repo).execute(session_id, uuid4())

    async def test_respects_a_custom_history_limit(self) -> None:
        session_id, user_id = uuid4(), uuid4()
        session = _session(session_id, user_id)
        repo = FakeChatRepo(session=session, history=[])

        await GetChatSessionUseCase(repo).execute(session_id, user_id, history_limit=10)

        assert repo.history_calls == [(session_id, 10)]
