from __future__ import annotations

import json

import httpx
import pytest

from app.core.errors import ModelRateLimitError, ModelUnavailableError, ProviderAuthError
from app.domain.ports.ai_provider import Message
from app.infrastructure.ai.openai_provider import OpenAIProvider


def _provider(handler) -> OpenAIProvider:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return OpenAIProvider("fake-key", http_client=client)


def _completion_response(text: str = "hi there") -> dict:
    return {
        "id": "chatcmpl-1",
        "object": "chat.completion",
        "created": 1,
        "model": "gpt-4o-mini",
        "choices": [
            {"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}
        ],
        "usage": {"prompt_tokens": 4, "completion_tokens": 3, "total_tokens": 7},
    }


def _openai_error(error_type: str, message: str) -> dict:
    return {"error": {"message": message, "type": error_type, "code": None}}


class TestComplete:
    async def test_parses_content_and_usage(self) -> None:
        provider = _provider(lambda r: httpx.Response(200, json=_completion_response("hello back")))
        result = await provider.complete([Message(role="user", content="hi")], model="gpt-4o-mini")

        assert result.content == "hello back"
        assert result.finish_reason == "stop"
        assert result.usage.prompt_tokens == 4
        assert result.usage.total_tokens == 7

    async def test_sends_messages_in_the_expected_shape(self) -> None:
        seen_body = None

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal seen_body
            seen_body = json.loads(request.content)
            return httpx.Response(200, json=_completion_response())

        provider = _provider(handler)
        await provider.complete(
            [Message(role="system", content="be terse"), Message(role="user", content="hi")],
            model="gpt-4o-mini",
        )

        assert seen_body["messages"] == [
            {"role": "system", "content": "be terse"},
            {"role": "user", "content": "hi"},
        ]

    async def test_maps_401_to_provider_auth_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(401, json=_openai_error("invalid_request_error", "bad key"))

        provider = _provider(handler)
        with pytest.raises(ProviderAuthError):
            await provider.complete([Message(role="user", content="hi")], model="gpt-4o-mini")

    async def test_maps_429_to_rate_limit_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(429, json=_openai_error("rate_limit_error", "slow down"))

        provider = _provider(handler)
        with pytest.raises(ModelRateLimitError):
            await provider.complete([Message(role="user", content="hi")], model="gpt-4o-mini")

    async def test_maps_other_errors_to_model_unavailable(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, json=_openai_error("server_error", "oops"))

        provider = _provider(handler)
        with pytest.raises(ModelUnavailableError):
            await provider.complete([Message(role="user", content="hi")], model="gpt-4o-mini")


class TestEmbed:
    async def test_sends_the_full_batch_and_returns_all_vectors(self) -> None:
        seen_input = None

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal seen_input
            body = json.loads(request.content)
            seen_input = body["input"]
            return httpx.Response(
                200,
                json={
                    "object": "list",
                    "data": [
                        {"object": "embedding", "index": 0, "embedding": [0.1, 0.2]},
                        {"object": "embedding", "index": 1, "embedding": [0.3, 0.4]},
                    ],
                    "model": "text-embedding-3-small",
                    "usage": {"prompt_tokens": 2, "total_tokens": 2},
                },
            )

        provider = _provider(handler)
        result = await provider.embed(["hello", "world"], model="text-embedding-3-small")

        assert result == [[0.1, 0.2], [0.3, 0.4]]
        assert seen_input == ["hello", "world"]


class TestIsAvailable:
    async def test_false_when_no_api_key_is_configured(self) -> None:
        transport = httpx.MockTransport(lambda r: httpx.Response(200, json={"data": []}))
        provider = OpenAIProvider("", http_client=httpx.AsyncClient(transport=transport))
        assert await provider.is_available() is False

    async def test_true_when_configured_and_the_api_responds(self) -> None:
        provider = _provider(lambda r: httpx.Response(200, json={"object": "list", "data": []}))
        assert await provider.is_available() is True


class TestCountTokens:
    def test_counts_using_tiktoken(self) -> None:
        provider = _provider(lambda r: httpx.Response(200, json={}))
        count = provider.count_tokens([Message(role="user", content="hello world")], model="gpt-4o-mini")
        assert count > 0

    def test_falls_back_to_cl100k_base_for_an_unknown_model(self) -> None:
        provider = _provider(lambda r: httpx.Response(200, json={}))
        count = provider.count_tokens(
            [Message(role="user", content="hello world")], model="some-future-model"
        )
        assert count > 0
