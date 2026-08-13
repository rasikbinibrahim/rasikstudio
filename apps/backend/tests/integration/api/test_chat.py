from __future__ import annotations

import asyncio
import subprocess
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.application.chat import send_message as send_message_module
from app.core.config import get_settings
from app.core.middleware.rate_limiter import limiter
from app.domain.ports.ai_provider import StreamChunk

AUTH = "/api/v1/auth"
WORKSPACES = "/api/v1/workspaces"
CHAT = "/api/v1/chat"


@pytest.fixture(autouse=True)
def _reset_limiter_counters() -> None:
    limiter.reset()


@pytest.fixture
async def _patch_chat_background(database_url: str, redis_url: str, monkeypatch: pytest.MonkeyPatch):
    """`stream_chat_reply()` deliberately opens its own DB session and Redis client rather than
    reusing `test_app`'s request-scoped `dependency_overrides` (see that function's docstring —
    a real bug that design avoids), so it needs its own route to the testcontainers: a real
    session factory bound to the same Postgres, and `REDIS_URL` pointed at the same Redis so its
    own `Redis.from_url(settings.redis_url)` call reaches the testcontainer too. Same technique
    `live_server` (Phase 7) and `test_agent_execution.py`'s `_patch_agent_infrastructure` use for
    the structurally identical problem in the WS gateway and the agent loop."""
    engine = create_async_engine(database_url)
    monkeypatch.setattr(
        send_message_module, "AsyncSessionLocal", async_sessionmaker(engine, expire_on_commit=False)
    )
    monkeypatch.setenv("REDIS_URL", redis_url)
    get_settings.cache_clear()
    yield
    await engine.dispose()


class FakeModelRouter:
    def __init__(self, chunks: list[StreamChunk]) -> None:
        self._chunks = chunks
        self.stream_calls: list[tuple[list, str]] = []

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


async def _authed_client_with_workspace(
    test_app: FastAPI, email: str, root_path: str | None = None
) -> tuple[AsyncClient, str]:
    transport = ASGITransport(app=test_app)
    client = AsyncClient(transport=transport, base_url="http://test")
    reg = await client.post(
        f"{AUTH}/register",
        json={"email": email, "name": "Test", "password": "correct-horse-battery-staple"},
    )
    assert reg.status_code == 201
    client.headers["Authorization"] = f"Bearer {reg.json()['access_token']}"

    ws = await client.post(
        WORKSPACES, json={"name": "proj", "root_path": root_path or f"/tmp/{email}"}
    )
    assert ws.status_code == 201
    return client, ws.json()["id"]


class TestCreateChatSession:
    async def test_creates_a_session_for_an_owned_workspace(self, test_app: FastAPI) -> None:
        client, workspace_id = await _authed_client_with_workspace(test_app, "chat-create@example.com")

        response = await client.post(
            f"{CHAT}/sessions",
            json={"workspace_id": workspace_id, "model": "gpt-4o-mini", "title": "Debug session"},
        )

        assert response.status_code == 201
        body = response.json()
        assert body["workspace_id"] == workspace_id
        assert body["title"] == "Debug session"
        assert body["model"] == "gpt-4o-mini"

    async def test_404s_for_a_workspace_the_caller_does_not_own(self, test_app: FastAPI) -> None:
        client_a, _ = await _authed_client_with_workspace(test_app, "chat-owner-a@example.com")
        _, workspace_b_id = await _authed_client_with_workspace(test_app, "chat-owner-b@example.com")

        response = await client_a.post(
            f"{CHAT}/sessions", json={"workspace_id": workspace_b_id, "model": "gpt-4o-mini"}
        )

        assert response.status_code == 404

    async def test_requires_authentication(self, test_app: FastAPI) -> None:
        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"{CHAT}/sessions", json={"workspace_id": str(uuid4()), "model": "gpt-4o-mini"}
            )
        assert response.status_code == 401


class TestListChatSessions:
    async def test_only_returns_sessions_for_the_requested_workspace(self, test_app: FastAPI) -> None:
        client, workspace_id = await _authed_client_with_workspace(test_app, "chat-list@example.com")
        await client.post(f"{CHAT}/sessions", json={"workspace_id": workspace_id, "model": "gpt-4o-mini"})
        await client.post(f"{CHAT}/sessions", json={"workspace_id": workspace_id, "model": "gpt-4o-mini"})

        response = await client.get(CHAT + "/sessions", params={"workspace_id": workspace_id})

        assert response.status_code == 200
        assert response.json()["total"] == 2


class TestGetChatSession:
    async def test_returns_the_session_with_empty_history_for_a_new_session(
        self, test_app: FastAPI
    ) -> None:
        client, workspace_id = await _authed_client_with_workspace(test_app, "chat-get@example.com")
        created = await client.post(
            f"{CHAT}/sessions", json={"workspace_id": workspace_id, "model": "gpt-4o-mini"}
        )
        session_id = created.json()["id"]

        response = await client.get(f"{CHAT}/sessions/{session_id}")

        assert response.status_code == 200
        body = response.json()
        assert body["session"]["id"] == session_id
        assert body["history"] == []

    async def test_404s_for_a_session_owned_by_a_different_user(self, test_app: FastAPI) -> None:
        client_a, workspace_a_id = await _authed_client_with_workspace(test_app, "chat-get-a@example.com")
        client_b, _ = await _authed_client_with_workspace(test_app, "chat-get-b@example.com")
        created = await client_a.post(
            f"{CHAT}/sessions", json={"workspace_id": workspace_a_id, "model": "gpt-4o-mini"}
        )
        session_id = created.json()["id"]

        response = await client_b.get(f"{CHAT}/sessions/{session_id}")

        assert response.status_code == 404


class TestDeleteChatSession:
    async def test_deletes_a_session_the_caller_owns(self, test_app: FastAPI) -> None:
        client, workspace_id = await _authed_client_with_workspace(test_app, "chat-delete@example.com")
        created = await client.post(
            f"{CHAT}/sessions", json={"workspace_id": workspace_id, "model": "gpt-4o-mini"}
        )
        session_id = created.json()["id"]

        delete_response = await client.delete(f"{CHAT}/sessions/{session_id}")
        get_response = await client.get(f"{CHAT}/sessions/{session_id}")

        assert delete_response.status_code == 204
        assert get_response.status_code == 404


class TestSendMessage:
    async def test_persists_the_user_message_and_streams_the_assistant_reply(
        self, test_app: FastAPI, _patch_chat_background: None, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        client, workspace_id = await _authed_client_with_workspace(test_app, "chat-send@example.com")
        created = await client.post(
            f"{CHAT}/sessions", json={"workspace_id": workspace_id, "model": "gpt-4o-mini"}
        )
        session_id = created.json()["id"]

        router = FakeModelRouter(
            [
                StreamChunk(delta="Sure, ", finish_reason=None, tool_calls=None),
                StreamChunk(delta="here you go.", finish_reason="stop", tool_calls=None),
            ]
        )
        monkeypatch.setattr(send_message_module, "ModelRouter", router)

        response = await client.post(f"{CHAT}/sessions/{session_id}/messages", json={"content": "help me"})

        assert response.status_code == 201
        assert response.json()["role"] == "user"
        assert response.json()["content"] == "help me"

        history = await _wait_for_history_length(client, session_id, expected=2)

        assert history[0]["role"] == "user"
        assert history[1]["role"] == "assistant"
        assert history[1]["content"] == "Sure, here you go."
        assert history[1]["finish_reason"] == "stop"
        assert history[1]["model"] == "gpt-4o-mini"
        # Real usage now recorded post-stream (`ModelRouter.count_tokens()`, since `StreamChunk`
        # itself carries no usage field) — `FakeModelRouter.count_tokens()` above counts raw
        # characters, so this is a real, computed value, not a guess.
        assert history[1]["token_count"] == len("Sure, here you go.")
        assert history[0]["token_count"] is None

    async def test_404s_for_a_session_owned_by_a_different_user(self, test_app: FastAPI) -> None:
        client_a, workspace_a_id = await _authed_client_with_workspace(test_app, "chat-send-a@example.com")
        client_b, _ = await _authed_client_with_workspace(test_app, "chat-send-b@example.com")
        created = await client_a.post(
            f"{CHAT}/sessions", json={"workspace_id": workspace_a_id, "model": "gpt-4o-mini"}
        )
        session_id = created.json()["id"]

        response = await client_b.post(f"{CHAT}/sessions/{session_id}/messages", json={"content": "hi"})

        assert response.status_code == 404

    async def test_including_git_diff_reaches_the_model_as_real_workspace_context(
        self, test_app: FastAPI, _patch_chat_background: None, monkeypatch: pytest.MonkeyPatch, tmp_path
    ) -> None:
        """Real end-to-end proof, not just a `context_builder.py` unit test: an actual `git diff`
        against a real throwaway repo (the workspace's own `root_path`) ends up in what the
        (fake) model actually receives, exercising the real `WorkspaceRepository` lookup
        `stream_chat_reply()` now does to resolve `workspace_root` from `session.workspace_id`."""
        subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
        subprocess.run(["git", "config", "user.email", "t@example.com"], cwd=tmp_path, check=True)
        subprocess.run(["git", "config", "user.name", "Test"], cwd=tmp_path, check=True)
        (tmp_path / "a.txt").write_text("hello\n")
        subprocess.run(["git", "add", "a.txt"], cwd=tmp_path, check=True)
        subprocess.run(["git", "commit", "-q", "-m", "initial"], cwd=tmp_path, check=True)
        (tmp_path / "a.txt").write_text("hello\nworld\n")

        client, workspace_id = await _authed_client_with_workspace(
            test_app, "chat-diff@example.com", root_path=str(tmp_path)
        )
        created = await client.post(
            f"{CHAT}/sessions", json={"workspace_id": workspace_id, "model": "gpt-4o-mini"}
        )
        session_id = created.json()["id"]

        router = FakeModelRouter([StreamChunk(delta="ok", finish_reason="stop", tool_calls=None)])
        monkeypatch.setattr(send_message_module, "ModelRouter", router)

        response = await client.post(
            f"{CHAT}/sessions/{session_id}/messages",
            json={"content": "what changed?", "include_git_diff": True},
        )

        assert response.status_code == 201
        await _wait_for_history_length(client, session_id, expected=2)

        sent_messages = router.stream_calls[0][0]
        workspace_context_messages = [
            m for m in sent_messages if m.role == "system" and "Uncommitted changes" in (m.content or "")
        ]
        assert len(workspace_context_messages) == 1
        assert "+world" in workspace_context_messages[0].content


async def _wait_for_history_length(client: AsyncClient, session_id: str, *, expected: int) -> list[dict]:
    async def _poll() -> list[dict]:
        while True:
            response = await client.get(f"{CHAT}/sessions/{session_id}")
            history = response.json()["history"]
            if len(history) >= expected:
                return history
            await asyncio.sleep(0.05)

    return await asyncio.wait_for(_poll(), timeout=5)
