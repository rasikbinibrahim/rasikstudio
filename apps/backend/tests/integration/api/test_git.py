import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.core.dependencies import get_model_router
from app.core.middleware.rate_limiter import limiter
from app.domain.ports.ai_provider import CompletionResult, TokenUsage

AUTH = "/api/v1/auth"
GENERATE = "/api/v1/git/generate-commit-message"


@pytest.fixture(autouse=True)
def _reset_limiter_counters() -> None:
    limiter.reset()


class FakeModelRouter:
    def __init__(self, content: str | None) -> None:
        self._content = content

    async def complete(self, messages, model, temperature=0.7, max_tokens=4096, **kwargs):
        return CompletionResult(
            content=self._content,
            tool_calls=None,
            finish_reason="stop",
            usage=TokenUsage(prompt_tokens=1, completion_tokens=1, total_tokens=2),
        )


async def _authed_client(test_app: FastAPI, email: str) -> AsyncClient:
    transport = ASGITransport(app=test_app)
    client = AsyncClient(transport=transport, base_url="http://test")
    reg = await client.post(
        f"{AUTH}/register",
        json={"email": email, "name": "Test", "password": "correct-horse-battery-staple"},
    )
    assert reg.status_code == 201
    client.headers["Authorization"] = f"Bearer {reg.json()['access_token']}"
    return client


class TestGenerateCommitMessage:
    async def test_requires_authentication(self, test_app: FastAPI) -> None:
        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(GENERATE, json={"diff": "x", "model": "claude-x"})
        assert response.status_code == 401

    async def test_returns_the_generated_commit_message(self, test_app: FastAPI) -> None:
        test_app.dependency_overrides[get_model_router] = lambda: FakeModelRouter(
            "fix: handle empty workspace list"
        )
        client = await _authed_client(test_app, "git-gen-ok@example.com")

        response = await client.post(
            GENERATE, json={"diff": "diff --git a/x b/x\n+foo", "model": "claude-x"}
        )

        assert response.status_code == 200
        assert response.json() == {"message": "fix: handle empty workspace list"}

    async def test_rejects_an_empty_diff_with_a_validation_error(self, test_app: FastAPI) -> None:
        test_app.dependency_overrides[get_model_router] = lambda: FakeModelRouter("unused")
        client = await _authed_client(test_app, "git-gen-empty@example.com")

        response = await client.post(GENERATE, json={"diff": "   ", "model": "claude-x"})

        assert response.status_code == 422
        assert response.json()["error"]["code"] == "empty_diff"
