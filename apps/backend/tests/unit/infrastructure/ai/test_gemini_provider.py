from __future__ import annotations

import json

import httpx
import pytest

from app.core.errors import ModelRateLimitError, ModelUnavailableError, ProviderAuthError
from app.domain.ports.ai_provider import Message, ToolCall
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


class TestToolResultConversion:
    """A `role="tool"` Message only carries `tool_call_id` (a `ToolCall.id`, an opaque uuid for
    Gemini — see `_extract_tool_calls`), not the function name Gemini's `function_response` part
    requires. The real name must be resolved from the preceding `assistant` message's own
    `tool_calls` list, the same one `base_agent.py`'s ReAct loop always appends first."""

    async def test_function_response_uses_the_real_function_name_not_the_call_id(self) -> None:
        seen_body = None

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal seen_body
            seen_body = json.loads(request.content)
            return httpx.Response(200, json=_generate_response())

        provider = _provider(handler)
        await provider.complete(
            [
                Message(role="user", content="what's in main.py?"),
                Message(
                    role="assistant",
                    content=None,
                    tool_calls=[ToolCall(id="call-xyz-123", name="read_file", arguments={"path": "main.py"})],
                ),
                Message(role="tool", content="print('hi')", tool_call_id="call-xyz-123"),
            ],
            model="gemini-2.0-flash",
        )

        tool_result_content = seen_body["contents"][2]
        function_response = tool_result_content["parts"][0]["functionResponse"]
        assert function_response["name"] == "read_file"
        assert function_response["name"] != "call-xyz-123"

    async def test_falls_back_to_the_call_id_when_no_matching_assistant_message_exists(self) -> None:
        seen_body = None

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal seen_body
            seen_body = json.loads(request.content)
            return httpx.Response(200, json=_generate_response())

        provider = _provider(handler)
        await provider.complete(
            [Message(role="tool", content="orphaned result", tool_call_id="unmatched-id")],
            model="gemini-2.0-flash",
        )

        function_response = seen_body["contents"][0]["parts"][0]["functionResponse"]
        assert function_response["name"] == "unmatched-id"


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
