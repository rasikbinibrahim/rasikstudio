from __future__ import annotations

import json

import httpx
import pytest

from app.core.errors import ModelUnavailableError
from app.domain.ports.ai_provider import Message, Tool
from app.infrastructure.ai.ollama_provider import OllamaProvider


def _provider(handler) -> OllamaProvider:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://ollama-test")
    return OllamaProvider("http://ollama-test", client=client)


class TestComplete:
    async def test_returns_a_parsed_completion_result(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.url.path == "/api/chat"
            body = json.loads(request.content)
            assert body["stream"] is False
            assert body["messages"] == [{"role": "user", "content": "hi"}]
            return httpx.Response(
                200,
                json={
                    "message": {"role": "assistant", "content": "hello back"},
                    "done": True,
                    "prompt_eval_count": 5,
                    "eval_count": 3,
                },
            )

        provider = _provider(handler)
        result = await provider.complete([Message(role="user", content="hi")], model="qwen2.5:7b")

        assert result.content == "hello back"
        assert result.finish_reason == "stop"
        assert result.usage.prompt_tokens == 5
        assert result.usage.completion_tokens == 3
        assert result.usage.total_tokens == 8

    async def test_parses_tool_calls_from_the_response(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "message": {
                        "role": "assistant",
                        "content": "",
                        "tool_calls": [
                            {"function": {"name": "read_file", "arguments": {"path": "a.py"}}}
                        ],
                    },
                    "done": True,
                },
            )

        provider = _provider(handler)
        tool = Tool(name="read_file", description="reads a file", parameters={})
        result = await provider.complete(
            [Message(role="user", content="read a.py")], model="qwen2.5:7b", tools=[tool]
        )

        assert result.finish_reason == "tool_calls"
        assert result.tool_calls is not None
        assert result.tool_calls[0].name == "read_file"
        assert result.tool_calls[0].arguments == {"path": "a.py"}

    async def test_raises_model_unavailable_on_http_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, json={"error": "internal error"})

        provider = _provider(handler)

        with pytest.raises(ModelUnavailableError):
            await provider.complete([Message(role="user", content="hi")], model="qwen2.5:7b")

    async def test_raises_model_unavailable_on_connection_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused", request=request)

        provider = _provider(handler)

        with pytest.raises(ModelUnavailableError):
            await provider.complete([Message(role="user", content="hi")], model="qwen2.5:7b")


class TestStream:
    async def test_yields_a_stream_chunk_per_ndjson_line(self) -> None:
        lines = [
            json.dumps({"message": {"content": "hel"}, "done": False}),
            json.dumps({"message": {"content": "lo"}, "done": False}),
            json.dumps({"message": {"content": ""}, "done": True}),
        ]

        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, content="\n".join(lines) + "\n")

        provider = _provider(handler)
        chunks = [
            c async for c in provider.stream([Message(role="user", content="hi")], model="qwen2.5:7b")
        ]

        assert [c.delta for c in chunks] == ["hel", "lo", ""]
        assert chunks[-1].finish_reason == "stop"
        assert chunks[0].finish_reason is None


class TestEmbed:
    async def test_sends_the_full_batch_in_one_request(self) -> None:
        seen_input = None

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal seen_input
            body = json.loads(request.content)
            seen_input = body["input"]
            return httpx.Response(200, json={"embeddings": [[0.1, 0.2], [0.3, 0.4]]})

        provider = _provider(handler)
        result = await provider.embed(["hello", "world"], model="nomic-embed-text")

        assert result == [[0.1, 0.2], [0.3, 0.4]]
        assert seen_input == ["hello", "world"]


class TestIsAvailable:
    async def test_true_when_the_server_responds(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"models": []})

        provider = _provider(handler)
        assert await provider.is_available() is True

    async def test_false_when_the_server_is_unreachable(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("refused", request=request)

        provider = _provider(handler)
        assert await provider.is_available() is False


class TestCountTokens:
    def test_falls_back_to_the_approximate_counter_with_no_prefetched_family(self) -> None:
        provider = _provider(lambda request: httpx.Response(200, json={}))
        count = provider.count_tokens([Message(role="user", content="hello world")], model="qwen2.5:7b")
        assert count > 0


class TestPrefetchModelFamily:
    async def test_caches_the_family_from_api_show(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.url.path == "/api/show"
            return httpx.Response(200, json={"details": {"family": "qwen2"}})

        provider = _provider(handler)
        await provider.prefetch_model_family("qwen2.5:7b")

        assert provider._family_cache["qwen2.5:7b"] == "qwen2"

    async def test_does_not_raise_when_api_show_fails(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500)

        provider = _provider(handler)
        await provider.prefetch_model_family("qwen2.5:7b")

        assert "qwen2.5:7b" not in provider._family_cache
