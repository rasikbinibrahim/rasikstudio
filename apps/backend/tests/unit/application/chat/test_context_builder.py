from __future__ import annotations

import subprocess
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.application.chat.context_builder import ActiveFileContext, build_chat_context
from app.domain.models.chat import Message as DomainMessage
from app.domain.ports.vector_store import VectorSearchResult


@pytest.fixture
def git_repo(tmp_path):
    """Same real-throwaway-repo pattern `test_git_tools.py`/`test_diff.py` already use — the
    git-diff context source shells out to a real `git diff`, not a mock."""
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=tmp_path, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=tmp_path, check=True)
    (tmp_path / "a.txt").write_text("hello\n")
    subprocess.run(["git", "add", "a.txt"], cwd=tmp_path, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "initial"], cwd=tmp_path, check=True)
    return tmp_path


def _history_message(role: str, content: str, session_id=None) -> DomainMessage:
    return DomainMessage(
        id=uuid4(),
        session_id=session_id or uuid4(),
        role=role,
        content=content,
        tool_calls=None,
        tool_call_id=None,
        token_count=None,
        finish_reason=None,
        model=None,
        created_at=datetime.now(UTC),
    )


class FakeEmbeddingService:
    def __init__(self, vector=None, error=None) -> None:
        self._vector = vector or [0.1, 0.2, 0.3]
        self._error = error
        self.embed_calls: list[list[str]] = []

    async def embed(self, texts):
        self.embed_calls.append(texts)
        if self._error is not None:
            raise self._error
        return [self._vector for _ in texts]


class FakeEmbeddingRepo:
    def __init__(self, results=None) -> None:
        self._results = results or []
        self.search_calls: list[dict] = []

    async def search(self, *, workspace_id, query_embedding, top_k=5):
        self.search_calls.append(
            {"workspace_id": workspace_id, "query_embedding": query_embedding, "top_k": top_k}
        )
        return self._results


class TestBuildChatContext:
    async def test_system_prompt_is_always_the_first_message(self) -> None:
        messages = await build_chat_context(
            system_prompt="Be terse.",
            workspace_id=uuid4(),
            active_file=None,
            history=[],
            user_message="hi",
            embedding_service=FakeEmbeddingService(),
            embedding_repo=FakeEmbeddingRepo(),
        )

        assert messages[0].role == "system"
        assert messages[0].content == "Be terse."

    async def test_falls_back_to_a_default_system_prompt_when_none_given(self) -> None:
        messages = await build_chat_context(
            system_prompt=None,
            workspace_id=uuid4(),
            active_file=None,
            history=[],
            user_message="hi",
            embedding_service=FakeEmbeddingService(),
            embedding_repo=FakeEmbeddingRepo(),
        )

        assert messages[0].role == "system"
        assert messages[0].content
        assert "Rasik Studio" in messages[0].content

    async def test_active_file_content_is_included_as_workspace_context(self) -> None:
        messages = await build_chat_context(
            system_prompt="sp",
            workspace_id=uuid4(),
            active_file=ActiveFileContext(path="src/main.py", content="print('hi')"),
            history=[],
            user_message="what does this do?",
            embedding_service=FakeEmbeddingService(),
            embedding_repo=FakeEmbeddingRepo(),
        )

        workspace_context = messages[1]
        assert workspace_context.role == "system"
        assert "src/main.py" in workspace_context.content
        assert "print('hi')" in workspace_context.content

    async def test_rag_results_are_embedded_in_the_workspace_context_message(self) -> None:
        result = VectorSearchResult(
            id=uuid4(), content="def foo(): ...", distance=0.1, metadata={"file_path": "lib/foo.py"}
        )
        messages = await build_chat_context(
            system_prompt="sp",
            workspace_id=uuid4(),
            active_file=None,
            history=[],
            user_message="what is foo?",
            embedding_service=FakeEmbeddingService(),
            embedding_repo=FakeEmbeddingRepo(results=[result]),
        )

        workspace_context = messages[1]
        assert "lib/foo.py" in workspace_context.content
        assert "def foo(): ..." in workspace_context.content

    async def test_no_workspace_context_message_when_there_is_nothing_to_add(self) -> None:
        messages = await build_chat_context(
            system_prompt="sp",
            workspace_id=uuid4(),
            active_file=None,
            history=[],
            user_message="hi",
            embedding_service=FakeEmbeddingService(),
            embedding_repo=FakeEmbeddingRepo(results=[]),
        )

        # Just the system prompt, then the user message — no empty/placeholder context message.
        assert [m.role for m in messages] == ["system", "user"]

    async def test_an_embedding_failure_degrades_to_no_rag_context_instead_of_raising(self) -> None:
        messages = await build_chat_context(
            system_prompt="sp",
            workspace_id=uuid4(),
            active_file=None,
            history=[],
            user_message="hi",
            embedding_service=FakeEmbeddingService(error=RuntimeError("provider down")),
            embedding_repo=FakeEmbeddingRepo(),
        )

        assert [m.role for m in messages] == ["system", "user"]

    async def test_history_excludes_the_sessions_own_system_message(self) -> None:
        session_id = uuid4()
        history = [
            _history_message("system", "old system prompt", session_id),
            _history_message("user", "first question", session_id),
            _history_message("assistant", "first answer", session_id),
        ]

        messages = await build_chat_context(
            system_prompt="sp",
            workspace_id=uuid4(),
            active_file=None,
            history=history,
            user_message="second question",
            embedding_service=FakeEmbeddingService(),
            embedding_repo=FakeEmbeddingRepo(),
        )

        roles = [m.role for m in messages]
        assert roles == ["system", "user", "assistant", "user"]
        assert messages[1].content == "first question"
        assert messages[2].content == "first answer"

    async def test_current_user_message_is_always_last(self) -> None:
        messages = await build_chat_context(
            system_prompt="sp",
            workspace_id=uuid4(),
            active_file=None,
            history=[_history_message("user", "earlier"), _history_message("assistant", "earlier reply")],
            user_message="the newest question",
            embedding_service=FakeEmbeddingService(),
            embedding_repo=FakeEmbeddingRepo(),
        )

        assert messages[-1].role == "user"
        assert messages[-1].content == "the newest question"

    async def test_rag_search_uses_an_embedding_of_the_user_message(self) -> None:
        embedding_service = FakeEmbeddingService(vector=[9.0, 9.0])
        embedding_repo = FakeEmbeddingRepo()
        workspace_id = uuid4()

        await build_chat_context(
            system_prompt="sp",
            workspace_id=workspace_id,
            active_file=None,
            history=[],
            user_message="find the auth code",
            embedding_service=embedding_service,
            embedding_repo=embedding_repo,
        )

        assert embedding_service.embed_calls == [["find the auth code"]]
        assert embedding_repo.search_calls[0]["workspace_id"] == workspace_id
        assert embedding_repo.search_calls[0]["query_embedding"] == [9.0, 9.0]

    async def test_includes_the_real_git_diff_when_opted_in(self, git_repo) -> None:
        (git_repo / "a.txt").write_text("hello\nworld\n")

        messages = await build_chat_context(
            system_prompt="sp",
            workspace_id=uuid4(),
            active_file=None,
            history=[],
            user_message="what changed?",
            embedding_service=FakeEmbeddingService(),
            embedding_repo=FakeEmbeddingRepo(),
            workspace_root=git_repo,
            include_git_diff=True,
        )

        workspace_context = messages[1]
        assert "Uncommitted changes" in workspace_context.content
        assert "+world" in workspace_context.content

    async def test_omits_the_diff_block_when_not_opted_in_even_with_a_real_diff_available(
        self, git_repo
    ) -> None:
        (git_repo / "a.txt").write_text("hello\nworld\n")

        messages = await build_chat_context(
            system_prompt="sp",
            workspace_id=uuid4(),
            active_file=None,
            history=[],
            user_message="hi",
            embedding_service=FakeEmbeddingService(),
            embedding_repo=FakeEmbeddingRepo(),
            workspace_root=git_repo,
            include_git_diff=False,
        )

        assert [m.role for m in messages] == ["system", "user"]

    async def test_omits_the_diff_block_when_opted_in_but_there_are_no_changes(self, git_repo) -> None:
        messages = await build_chat_context(
            system_prompt="sp",
            workspace_id=uuid4(),
            active_file=None,
            history=[],
            user_message="hi",
            embedding_service=FakeEmbeddingService(),
            embedding_repo=FakeEmbeddingRepo(),
            workspace_root=git_repo,
            include_git_diff=True,
        )

        assert [m.role for m in messages] == ["system", "user"]

    async def test_opted_in_with_no_workspace_root_degrades_silently(self) -> None:
        messages = await build_chat_context(
            system_prompt="sp",
            workspace_id=uuid4(),
            active_file=None,
            history=[],
            user_message="hi",
            embedding_service=FakeEmbeddingService(),
            embedding_repo=FakeEmbeddingRepo(),
            workspace_root=None,
            include_git_diff=True,
        )

        assert [m.role for m in messages] == ["system", "user"]
