from __future__ import annotations

from uuid import uuid4

from app.application.chat.create_session import CreateChatSessionRequest, CreateChatSessionUseCase


class FakeChatRepo:
    def __init__(self) -> None:
        self.created = []

    async def create_session(self, session):
        self.created.append(session)
        return session


class TestCreateChatSessionUseCase:
    async def test_creates_a_session_with_the_requested_fields(self) -> None:
        repo = FakeChatRepo()
        workspace_id, user_id = uuid4(), uuid4()
        request = CreateChatSessionRequest(
            workspace_id=workspace_id,
            user_id=user_id,
            title="Debugging the auth flow",
            model="claude-sonnet-4-5",
            system_prompt="Be concise.",
        )

        session = await CreateChatSessionUseCase(repo).execute(request)

        assert session.workspace_id == workspace_id
        assert session.user_id == user_id
        assert session.title == "Debugging the auth flow"
        assert session.model == "claude-sonnet-4-5"
        assert session.system_prompt == "Be concise."
        assert repo.created == [session]

    async def test_defaults_system_prompt_to_none(self) -> None:
        repo = FakeChatRepo()
        request = CreateChatSessionRequest(
            workspace_id=uuid4(), user_id=uuid4(), title="New Chat", model="gpt-4o-mini"
        )

        session = await CreateChatSessionUseCase(repo).execute(request)

        assert session.system_prompt is None
