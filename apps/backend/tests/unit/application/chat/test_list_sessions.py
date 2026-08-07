from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from app.application.chat.list_sessions import ListChatSessionsUseCase
from app.domain.models.chat import ChatSession


def _session(workspace_id) -> ChatSession:
    now = datetime.now(UTC)
    return ChatSession(
        id=uuid4(),
        workspace_id=workspace_id,
        user_id=uuid4(),
        title="New Chat",
        model="gpt-4o-mini",
        system_prompt=None,
        created_at=now,
        updated_at=now,
    )


class FakeChatRepo:
    def __init__(self, sessions) -> None:
        self._sessions = sessions
        self.list_calls = []

    async def list_sessions(self, workspace_id):
        self.list_calls.append(workspace_id)
        return [s for s in self._sessions if s.workspace_id == workspace_id]


class TestListChatSessionsUseCase:
    async def test_returns_sessions_for_the_requested_workspace(self) -> None:
        workspace_id = uuid4()
        matching = _session(workspace_id)
        other = _session(uuid4())
        repo = FakeChatRepo([matching, other])

        result = await ListChatSessionsUseCase(repo).execute(workspace_id)

        assert result == [matching]
        assert repo.list_calls == [workspace_id]
