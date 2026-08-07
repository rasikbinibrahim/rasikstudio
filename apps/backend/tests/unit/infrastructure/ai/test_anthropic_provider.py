from __future__ import annotations

import json

import httpx
import pytest

from app.core.errors import ModelRateLimitError, ModelUnavailableError, ProviderAuthError
from app.domain.ports.ai_provider import Message
from app.infrastructure.ai.anthropic_provider import AnthropicProvider


def _provider(handler) -> AnthropicProvider:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return AnthropicProvider("fake-key", http_client=client)


def _message_response(text: str = "hi there") -> dict:
    return {
        "id": "msg_1",
        "type": "message",
        "role": "assistant",
        "model": "claude-sonnet-4-5",
        "content": [{"type": "text", "text": text}],
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": {"input_tokens": 5, "output_tokens": 3},
    }


class TestComplete:
    async def test_splits_the_system_message_out_of_the_transcript(self) -> None:
        seen_body = None

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal seen_body
            seen_body = json.loads(request.content)
            return httpx.Response(200, json=_message_response())

        provider = _provider(handler)
        await provider.complete(
            [Message(role="system", content="be terse"), Message(role="user", content="hi")],
            model="claude-sonnet-4-5",
        )

        assert seen_body["system"] == "be terse"
        assert seen_body["messages"] == [{"role": "user", "content": "hi"}]

    async def test_parses_content_and_usage(self) -> None:
        provider = _provider(lambda r: httpx.Response(200, json=_message_response("hello back")))
        result = await provider.complete([Message(role="user", content="hi")], model="claude-sonnet-4-5")

        assert result.content == "hello back"
        assert result.finish_reason == "end_turn"
        assert result.usage.prompt_tokens == 5
        assert result.usage.completion_tokens == 3

    async def test_maps_401_to_provider_auth_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                401, json={"type": "error", "error": {"type": "authentication_error", "message": "bad key"}}
            )

        provider = _provider(handler)
        with pytest.raises(ProviderAuthError):
            await provider.complete([Message(role="user", content="hi")], model="claude-sonnet-4-5")

    async def test_maps_429_to_rate_limit_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                429, json={"type": "error", "error": {"type": "rate_limit_error", "message": "slow down"}}
            )

        provider = _provider(handler)
        with pytest.raises(ModelRateLimitError):
            await provider.complete([Message(role="user", content="hi")], model="claude-sonnet-4-5")

    async def test_maps_other_errors_to_model_unavailable(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                500, json={"type": "error", "error": {"type": "api_error", "message": "oops"}}
            )

        provider = _provider(handler)
        with pytest.raises(ModelUnavailableError):
            await provider.complete([Message(role="user", content="hi")], model="claude-sonnet-4-5")


class TestEmbed:
    async def test_raises_model_unavailable_since_anthropic_has_no_embeddings_api(self) -> None:
        provider = _provider(lambda r: httpx.Response(200, json={}))
        with pytest.raises(ModelUnavailableError):
            await provider.embed(["hi"], model="claude-sonnet-4-5")


class TestIsAvailable:
    async def test_false_when_no_api_key_is_configured(self) -> None:
        empty_page = {"data": [], "first_id": None, "last_id": None, "has_more": False}
        transport = httpx.MockTransport(lambda r: httpx.Response(200, json=empty_page))
        client = httpx.AsyncClient(transport=transport)
        provider = AnthropicProvider("", http_client=client)
        assert await provider.is_available() is False

    async def test_true_when_configured_and_the_api_responds(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            empty_page = {"data": [], "first_id": None, "last_id": None, "has_more": False}
            return httpx.Response(200, json=empty_page)

        provider = _provider(handler)
        assert await provider.is_available() is True

    async def test_false_when_the_api_rejects_the_key(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                401, json={"type": "error", "error": {"type": "authentication_error", "message": "bad key"}}
            )

        provider = _provider(handler)
        assert await provider.is_available() is False
