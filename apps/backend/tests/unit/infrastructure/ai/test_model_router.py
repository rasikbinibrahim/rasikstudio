from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field

import pytest

from app.core.errors import ModelUnavailableError, ValidationError
from app.domain.ports.ai_provider import CompletionResult, Message, StreamChunk, TokenUsage
from app.infrastructure.ai.model_router import ModelRouter, resolve_provider_name


class FakeRedis:
    """Minimal in-memory stand-in for the two `redis.asyncio.Redis` methods `ModelRouter` uses —
    same "fake conforming structurally to what the code needs" approach as
    `tests/unit/application/auth/test_oauth.py`'s `FakeUserRepository`."""

    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.setex_calls: list[tuple[str, int, str]] = []

    async def get(self, key: str) -> str | None:
        return self.store.get(key)

    async def setex(self, key: str, ttl: int, value: str) -> None:
        self.store[key] = value
        self.setex_calls.append((key, ttl, value))


@dataclass
class FakeProvider:
    complete_result: CompletionResult | None = None
    complete_error: Exception | None = None
    stream_chunks: list[StreamChunk] = field(default_factory=list)
    stream_error: Exception | None = None
    stream_error_after_first_chunk: bool = False
    calls: list[str] = field(default_factory=list)

    async def complete(self, messages, model, temperature=0.7, max_tokens=4096, tools=None):
        self.calls.append(model)
        if self.complete_error is not None:
            raise self.complete_error
        assert self.complete_result is not None
        return self.complete_result

    async def stream(
        self, messages, model, temperature=0.7, max_tokens=4096, tools=None
    ) -> AsyncIterator[StreamChunk]:
        self.calls.append(model)
        if self.stream_error is not None and not self.stream_error_after_first_chunk:
            raise self.stream_error
        for chunk in self.stream_chunks:
            yield chunk
        if self.stream_error is not None and self.stream_error_after_first_chunk:
            raise self.stream_error

    async def embed(self, texts, model):
        raise NotImplementedError

    async def is_available(self) -> bool:
        return True

    def count_tokens(self, messages, model) -> int:
        return sum(len(m.content or "") for m in messages)


def _result(text: str) -> CompletionResult:
    return CompletionResult(
        content=text, tool_calls=None, finish_reason="stop", usage=TokenUsage(1, 1, 2)
    )


FALLBACK_CHAINS = {
    "chat": ["deepseek-r1:7b", "qwen2.5:72b", "claude-sonnet-4-5", "gpt-4o-mini"],
}


class TestResolveProviderName:
    @pytest.mark.parametrize(
        ("model", "expected"),
        [
            ("deepseek-r1:7b", "ollama"),
            ("qwen2.5-coder:1.5b", "ollama"),
            ("claude-sonnet-4-5", "anthropic"),
            ("gpt-4o-mini", "openai"),
            ("o1-preview", "openai"),
            ("gemini-2.0-flash", "gemini"),
        ],
    )
    def test_resolves_known_prefixes(self, model: str, expected: str) -> None:
        assert resolve_provider_name(model) == expected

    def test_raises_for_an_unknown_model(self) -> None:
        with pytest.raises(ValidationError):
            resolve_provider_name("totally-unrecognized-model")


class TestComplete:
    async def test_returns_the_provider_result_and_caches_it(self) -> None:
        ollama = FakeProvider(complete_result=_result("hi"))
        redis = FakeRedis()
        router = ModelRouter({"ollama": ollama}, FALLBACK_CHAINS, redis, cache_ttl_seconds=3600)

        result = await router.complete([Message(role="user", content="hi")], "deepseek-r1:7b")

        assert result.content == "hi"
        assert len(redis.setex_calls) == 1
        key, ttl, _ = redis.setex_calls[0]
        assert key.startswith("model:cache:")
        assert ttl == 3600

    async def test_cache_hit_skips_the_provider_entirely(self) -> None:
        ollama = FakeProvider(complete_result=_result("hi"))
        redis = FakeRedis()
        router = ModelRouter({"ollama": ollama}, FALLBACK_CHAINS, redis, cache_ttl_seconds=3600)
        messages = [Message(role="user", content="hi")]

        first = await router.complete(messages, "deepseek-r1:7b")
        second = await router.complete(messages, "deepseek-r1:7b")

        assert first.content == second.content == "hi"
        assert ollama.calls == ["deepseek-r1:7b"]  # only called once

    async def test_requests_with_tools_are_never_cached(self) -> None:
        from app.domain.ports.ai_provider import Tool

        ollama = FakeProvider(complete_result=_result("hi"))
        redis = FakeRedis()
        router = ModelRouter({"ollama": ollama}, FALLBACK_CHAINS, redis, cache_ttl_seconds=3600)
        tool = Tool(name="read_file", description="reads a file", parameters={})

        await router.complete([Message(role="user", content="hi")], "deepseek-r1:7b", tools=[tool])

        assert redis.setex_calls == []

    async def test_falls_back_to_the_next_model_in_the_chain_when_unavailable(self) -> None:
        ollama = FakeProvider(complete_error=ModelUnavailableError("ollama down"))
        anthropic = FakeProvider(complete_result=_result("from claude"))
        redis = FakeRedis()
        router = ModelRouter(
            {"ollama": ollama, "anthropic": anthropic}, FALLBACK_CHAINS, redis, cache_ttl_seconds=3600
        )

        result = await router.complete([Message(role="user", content="hi")], "qwen2.5:72b", use_cache=False)

        assert result.content == "from claude"
        assert anthropic.calls == ["claude-sonnet-4-5"]

    async def test_raises_the_original_error_once_the_fallback_chain_is_exhausted(self) -> None:
        original_error = ModelUnavailableError("gpt down")
        openai = FakeProvider(complete_error=original_error)
        redis = FakeRedis()
        router = ModelRouter({"openai": openai}, FALLBACK_CHAINS, redis, cache_ttl_seconds=3600)

        with pytest.raises(ModelUnavailableError) as exc_info:
            await router.complete([Message(role="user", content="hi")], "gpt-4o-mini", use_cache=False)

        assert exc_info.value is original_error

    async def test_raises_immediately_when_the_model_has_no_configured_fallback(self) -> None:
        gemini = FakeProvider(complete_error=ModelUnavailableError("gemini down"))
        redis = FakeRedis()
        router = ModelRouter({"gemini": gemini}, FALLBACK_CHAINS, redis, cache_ttl_seconds=3600)

        with pytest.raises(ModelUnavailableError):
            await router.complete([Message(role="user", content="hi")], "gemini-2.0-flash", use_cache=False)


class TestStream:
    async def test_yields_chunks_from_the_provider(self) -> None:
        chunks = [
            StreamChunk(delta="hel", finish_reason=None, tool_calls=None),
            StreamChunk(delta="lo", finish_reason="stop", tool_calls=None),
        ]
        ollama = FakeProvider(stream_chunks=chunks)
        redis = FakeRedis()
        router = ModelRouter({"ollama": ollama}, FALLBACK_CHAINS, redis, cache_ttl_seconds=3600)

        result = [c async for c in router.stream([Message(role="user", content="hi")], "deepseek-r1:7b")]

        assert result == chunks

    async def test_falls_back_before_any_chunk_is_yielded(self) -> None:
        ollama = FakeProvider(stream_error=ModelUnavailableError("ollama down"))
        anthropic = FakeProvider(
            stream_chunks=[StreamChunk(delta="hi", finish_reason="stop", tool_calls=None)]
        )
        redis = FakeRedis()
        router = ModelRouter(
            {"ollama": ollama, "anthropic": anthropic}, FALLBACK_CHAINS, redis, cache_ttl_seconds=3600
        )

        result = [c async for c in router.stream([Message(role="user", content="hi")], "qwen2.5:72b")]

        assert result == [StreamChunk(delta="hi", finish_reason="stop", tool_calls=None)]

    async def test_propagates_a_mid_stream_failure_instead_of_falling_back(self) -> None:
        ollama = FakeProvider(
            stream_chunks=[StreamChunk(delta="par", finish_reason=None, tool_calls=None)],
            stream_error=ModelUnavailableError("dropped mid-stream"),
            stream_error_after_first_chunk=True,
        )
        redis = FakeRedis()
        router = ModelRouter({"ollama": ollama}, FALLBACK_CHAINS, redis, cache_ttl_seconds=3600)

        collected = []
        with pytest.raises(ModelUnavailableError):
            async for chunk in router.stream([Message(role="user", content="hi")], "deepseek-r1:7b"):
                collected.append(chunk)

        assert len(collected) == 1
