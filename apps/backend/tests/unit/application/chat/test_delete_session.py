from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.application.chat.delete_session import DeleteChatSessionUseCase
from app.core.errors import ChatError
from app.domain.models.chat import ChatSession


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


class FakeChatRepo:
    def __init__(self, session=None) -> None:
        self._session = session
        self.deleted = []

    async def get_session(self, session_id):
        return self._session if self._session and self._session.id == session_id else None

    async def delete_session(self, session_id):
        self.deleted.append(session_id)


class TestDeleteChatSessionUseCase:
    async def test_deletes_a_session_the_user_owns(self) -> None:
        session_id, user_id = uuid4(), uuid4()
        repo = FakeChatRepo(session=_session(session_id, user_id))

        await DeleteChatSessionUseCase(repo).execute(session_id, user_id)

        assert repo.deleted == [session_id]

    async def test_raises_for_a_session_that_does_not_exist(self) -> None:
        repo = FakeChatRepo(session=None)
        with pytest.raises(ChatError):
            await DeleteChatSessionUseCase(repo).execute(uuid4(), uuid4())
        assert repo.deleted == []

    async def test_raises_for_a_session_owned_by_a_different_user(self) -> None:
        session_id = uuid4()
        repo = FakeChatRepo(session=_session(session_id, uuid4()))

        with pytest.raises(ChatError):
            await DeleteChatSessionUseCase(repo).execute(session_id, uuid4())
        assert repo.deleted == []
