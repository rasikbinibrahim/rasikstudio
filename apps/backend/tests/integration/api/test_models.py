import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from redis.asyncio import Redis

from app.core.middleware.rate_limiter import limiter

AUTH = "/api/v1/auth"
MODELS = "/api/v1/models"


@pytest.fixture(autouse=True)
def _reset_limiter_counters() -> None:
    limiter.reset()


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


class TestListModels:
    async def test_requires_authentication(self, test_app: FastAPI) -> None:
        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(MODELS)
        assert response.status_code == 401

    async def test_returns_every_known_model_with_its_provider_and_context_window(
        self, test_app: FastAPI
    ) -> None:
        client = await _authed_client(test_app, "models-list@example.com")

        response = await client.get(MODELS)

        assert response.status_code == 200
        items = response.json()["items"]
        by_id = {item["id"]: item for item in items}
        assert by_id["claude-sonnet-4-5"]["provider"] == "anthropic"
        assert by_id["claude-sonnet-4-5"]["context_window"] == 200_000
        assert by_id["deepseek-r1:7b"]["provider"] == "ollama"
        assert by_id["gemini-2.0-flash"]["provider"] == "gemini"
        assert by_id["gpt-4o"]["provider"] == "openai"
        assert by_id["nomic-embed-text"]["provider"] == "ollama"
        assert by_id["text-embedding-3-small"]["provider"] == "openai"

    async def test_reflects_live_availability_from_redis(
        self, test_app: FastAPI, redis_url: str
    ) -> None:
        redis = Redis.from_url(redis_url, decode_responses=True)
        await redis.set("provider:available:anthropic", 1, ex=120)
        await redis.set("provider:available:openai", 0, ex=120)
        client = await _authed_client(test_app, "models-availability@example.com")

        response = await client.get(MODELS)

        items = {item["id"]: item for item in response.json()["items"]}
        assert items["claude-sonnet-4-5"]["available"] is True
        assert items["gpt-4o"]["available"] is False
        await redis.aclose()

    async def test_unknown_provider_flag_defaults_to_unavailable(self, test_app: FastAPI) -> None:
        client = await _authed_client(test_app, "models-unknown-flag@example.com")

        response = await client.get(MODELS)

        items = {item["id"]: item for item in response.json()["items"]}
        assert items["gemini-2.0-flash"]["available"] is False


class TestGetModel:
    async def test_returns_the_model_info(self, test_app: FastAPI) -> None:
        # `available` isn't asserted to an exact value here — it reads a Redis flag written by
        # `ProviderAvailabilityChecker`/other tests in this session-scoped-container test run, and
        # is exercised precisely by `TestListModels`'s availability tests above. This test is only
        # about the id/provider/context_window contract.
        client = await _authed_client(test_app, "models-get@example.com")

        response = await client.get(f"{MODELS}/claude-sonnet-4-5")

        assert response.status_code == 200
        body = response.json()
        assert body["id"] == "claude-sonnet-4-5"
        assert body["provider"] == "anthropic"
        assert body["context_window"] == 200_000
        assert isinstance(body["available"], bool)

    async def test_returns_404_for_an_unknown_model(self, test_app: FastAPI) -> None:
        client = await _authed_client(test_app, "models-get-unknown@example.com")

        response = await client.get(f"{MODELS}/not-a-real-model")

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "unknown_model"

    async def test_requires_authentication(self, test_app: FastAPI) -> None:
        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"{MODELS}/claude-sonnet-4-5")
        assert response.status_code == 401
