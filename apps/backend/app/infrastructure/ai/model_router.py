from __future__ import annotations

import hashlib
import json
from collections.abc import AsyncIterator
from dataclasses import asdict
from functools import lru_cache
from pathlib import Path
from typing import Any

import structlog
import yaml
from redis.asyncio import Redis

from app.core.errors import ModelUnavailableError, ValidationError
from app.domain.ports.ai_provider import (
    AIProvider,
    CompletionResult,
    Message,
    StreamChunk,
    TokenUsage,
    Tool,
    ToolCall,
)
from app.infrastructure.ai.context_manager import truncate_messages

logger = structlog.get_logger("ai.model_router")

_MAX_FALLBACK_HOPS = 4


@lru_cache
def load_fallback_chains(path: str) -> dict[str, list[str]]:
    text = Path(path).read_text()
    data = yaml.safe_load(text) or {}
    return {str(k): [str(m) for m in v] for k, v in data.items()}


# MODEL_ROUTER.md §5's prefix rules (colon → Ollama, `claude-`/`gpt-`/`o*`/`gemini-`) assume every
# model id looks like a *chat* model. Embedding model names don't: `nomic-embed-text` has no
# colon and `text-embedding-3-small` starts with neither `gpt` nor `o`, so both entries in
# `config/fallback_chains.yaml`'s `embedding` chain would otherwise raise "Unknown model" — this
# explicit table is checked first for exactly the names that don't fit the prefix convention.
_EXPLICIT_PROVIDER_OVERRIDES: dict[str, str] = {
    "nomic-embed-text": "ollama",
    "text-embedding-3-small": "openai",
    "text-embedding-3-large": "openai",
}


def resolve_provider_name(model: str) -> str:
    """Maps a model id to the provider that serves it, per MODEL_ROUTER.md §5. Ollama models are
    identified by a `family:tag` shape (e.g. `deepseek-r1:7b`) — checked first and explicitly
    excluded from the `claude`/`gpt` prefixes so a cloud model id never accidentally matches it."""
    if model in _EXPLICIT_PROVIDER_OVERRIDES:
        return _EXPLICIT_PROVIDER_OVERRIDES[model]
    if ":" in model and not model.startswith("claude") and not model.startswith("gpt"):
        return "ollama"
    if model.startswith("claude"):
        return "anthropic"
    if model.startswith("gpt") or model.startswith("o"):
        return "openai"
    if model.startswith("gemini"):
        return "gemini"
    raise ValidationError(f"Unknown model: {model}", code="unknown_model")


class ModelRouter:
    """Unified entry point every backend service calls instead of talking to a provider
    directly — resolves the provider from the model string, truncates messages to fit the
    model's context window, retries the next model in the relevant fallback chain on
    `ModelUnavailableError`, and caches non-streaming/non-tool responses in Redis."""

    def __init__(
        self,
        providers: dict[str, AIProvider],
        fallback_chains: dict[str, list[str]],
        redis: Redis,
        cache_ttl_seconds: int,
    ) -> None:
        self._providers = providers
        self._fallback_chains = fallback_chains
        self._redis = redis
        self._cache_ttl_seconds = cache_ttl_seconds

    def _resolve(self, model: str) -> tuple[AIProvider, str]:
        provider_name = resolve_provider_name(model)
        provider = self._providers.get(provider_name)
        if provider is None:
            raise ModelUnavailableError(f"Provider '{provider_name}' is not configured")
        return provider, model

    def count_tokens(self, messages: list[Message], model: str) -> int:
        """A thin passthrough to the resolved provider's own `count_tokens()` — every caller that
        needs a token estimate (context-window truncation, or `send_message.py`'s post-stream
        usage recording, since `StreamChunk` carries no usage field the way `CompletionResult`
        does) should go through `ModelRouter` like every other provider call, not resolve a
        provider directly itself."""
        provider, resolved_model = self._resolve(model)
        return provider.count_tokens(messages, resolved_model)

    def _next_fallback(self, model: str) -> str | None:
        for chain in self._fallback_chains.values():
            if model in chain:
                index = chain.index(model)
                if index + 1 < len(chain):
                    return chain[index + 1]
        return None

    async def complete(
        self,
        messages: list[Message],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: list[Tool] | None = None,
        use_cache: bool = True,
        _hops: int = 0,
    ) -> CompletionResult:
        cache_key = None
        if use_cache and not tools:
            cache_key = self._cache_key(model, messages, temperature, max_tokens)
            if cached := await self._redis.get(cache_key):
                return self._deserialize(json.loads(cached))

        try:
            provider, resolved_model = self._resolve(model)
            truncated = truncate_messages(
                messages, resolved_model, lambda msgs: provider.count_tokens(msgs, resolved_model)
            )
            result = await provider.complete(
                truncated, resolved_model, temperature=temperature, max_tokens=max_tokens, tools=tools
            )
        except ModelUnavailableError as exc:
            fallback = None if _hops >= _MAX_FALLBACK_HOPS else self._next_fallback(model)
            if fallback is None:
                raise
            logger.warning("model_fallback", from_model=model, to_model=fallback)
            try:
                return await self.complete(
                    messages, fallback, temperature, max_tokens, tools, use_cache, _hops=_hops + 1
                )
            except ModelUnavailableError:
                raise exc from None

        if cache_key is not None:
            await self._redis.setex(cache_key, self._cache_ttl_seconds, json.dumps(asdict(result)))
        return result

    async def stream(
        self,
        messages: list[Message],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: list[Tool] | None = None,
        _hops: int = 0,
    ) -> AsyncIterator[StreamChunk]:
        """Streaming responses are never cached (per MODEL_ROUTER.md §10) and can only fall back
        before the first chunk is yielded — once a caller has seen partial output from one model,
        silently restarting from a different one would produce a corrupted transcript, so a
        mid-stream failure propagates instead of falling back."""
        provider, resolved_model = self._resolve(model)
        truncated = truncate_messages(
            messages, resolved_model, lambda msgs: provider.count_tokens(msgs, resolved_model)
        )
        started = False
        try:
            async for chunk in provider.stream(
                truncated, resolved_model, temperature=temperature, max_tokens=max_tokens, tools=tools
            ):
                started = True
                yield chunk
        except ModelUnavailableError:
            if started or _hops >= _MAX_FALLBACK_HOPS:
                raise
            fallback = self._next_fallback(model)
            if fallback is None:
                raise
            logger.warning("model_fallback_stream", from_model=model, to_model=fallback)
            async for chunk in self.stream(messages, fallback, temperature, max_tokens, tools, _hops + 1):
                yield chunk

    @staticmethod
    def _cache_key(model: str, messages: list[Message], temperature: float, max_tokens: int) -> str:
        payload = {
            "model": model,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "messages": [asdict(m) for m in messages],
        }
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        return f"model:cache:{digest}"

    @staticmethod
    def _deserialize(data: dict[str, Any]) -> CompletionResult:
        tool_calls = None
        if data.get("tool_calls"):
            tool_calls = [ToolCall(**tc) for tc in data["tool_calls"]]
        return CompletionResult(
            content=data.get("content"),
            tool_calls=tool_calls,
            finish_reason=data["finish_reason"],
            usage=TokenUsage(**data["usage"]),
        )
