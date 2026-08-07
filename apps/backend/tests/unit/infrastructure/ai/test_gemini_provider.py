from __future__ import annotations

import json

import httpx
import pytest

from app.core.errors import ModelRateLimitError, ModelUnavailableError, ProviderAuthError
from app.domain.ports.ai_provider import Message
from app.infrastructure.ai.gemini_provider import GeminiProvider


def _provider(handler) -> GeminiProvider:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return GeminiProvider("fake-key", http_client=client)


def _generate_response(text: str = "hi there") -> dict:
    return {
        "candidates": [
            {
                "content": {"role": "model", "parts": [{"text": text}]},
                "finishReason": "STOP",
            }
        ],
        "usageMetadata": {"promptTokenCount": 4, "candidatesTokenCount": 3, "totalTokenCount": 7},
    }


class TestComplete:
    async def test_parses_content_and_usage(self) -> None:
        provider = _provider(lambda r: httpx.Response(200, json=_generate_response("hello back")))
        result = await provider.complete([Message(role="user", content="hi")], model="gemini-2.0-flash")

        assert result.content == "hello back"
        assert result.finish_reason == "stop"
        assert result.usage.prompt_tokens == 4
        assert result.usage.completion_tokens == 3

    async def test_sends_the_system_instruction_separately(self) -> None:
        seen_body = None

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal seen_body
            seen_body = json.loads(request.content)
            return httpx.Response(200, json=_generate_response())

        provider = _provider(handler)
        await provider.complete(
            [Message(role="system", content="be terse"), Message(role="user", content="hi")],
            model="gemini-2.0-flash",
        )

        assert seen_body["systemInstruction"]["parts"][0]["text"] == "be terse"
        assert seen_body["contents"] == [{"role": "user", "parts": [{"text": "hi"}]}]

    async def test_maps_401_to_provider_auth_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(401, json={"error": {"code": 401, "message": "unauthorized"}})

        provider = _provider(handler)
        with pytest.raises(ProviderAuthError):
            await provider.complete([Message(role="user", content="hi")], model="gemini-2.0-flash")

    async def test_maps_invalid_api_key_400_to_provider_auth_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                400,
                json={
                    "error": {
                        "code": 400,
                        "status": "INVALID_ARGUMENT",
                        "message": "API key not valid. Please pass a valid API key.",
                    }
                },
            )

        provider = _provider(handler)
        with pytest.raises(ProviderAuthError):
            await provider.complete([Message(role="user", content="hi")], model="gemini-2.0-flash")

    async def test_maps_429_to_rate_limit_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(429, json={"error": {"code": 429, "message": "slow down"}})

        provider = _provider(handler)
        with pytest.raises(ModelRateLimitError):
            await provider.complete([Message(role="user", content="hi")], model="gemini-2.0-flash")

    async def test_maps_other_errors_to_model_unavailable(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, json={"error": {"code": 500, "message": "oops"}})

        provider = _provider(handler)
        with pytest.raises(ModelUnavailableError):
            await provider.complete([Message(role="user", content="hi")], model="gemini-2.0-flash")


class TestEmbed:
    async def test_sends_the_full_batch_and_returns_all_vectors(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "embeddings": [
                        {"values": [0.1, 0.2]},
                        {"values": [0.3, 0.4]},
                    ]
                },
            )

        provider = _provider(handler)
        result = await provider.embed(["hello", "world"], model="text-embedding-004")

        assert result == [[0.1, 0.2], [0.3, 0.4]]


class TestIsAvailable:
    async def test_false_when_no_api_key_is_configured(self) -> None:
        transport = httpx.MockTransport(lambda r: httpx.Response(200, json={"models": []}))
        provider = GeminiProvider("", http_client=httpx.AsyncClient(transport=transport))
        assert await provider.is_available() is False

    async def test_true_when_configured_and_the_api_responds(self) -> None:
        provider = _provider(lambda r: httpx.Response(200, json={"models": []}))
        assert await provider.is_available() is True

    async def test_false_when_the_api_rejects_the_key(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(401, json={"error": {"code": 401, "message": "unauthorized"}})

        provider = _provider(handler)
        assert await provider.is_available() is False
