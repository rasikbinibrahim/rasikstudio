from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

import httpx
import structlog

from app.core.errors import ModelUnavailableError
from app.domain.ports.ai_provider import (
    CompletionResult,
    Message,
    StreamChunk,
    TokenUsage,
    Tool,
    ToolCall,
)
from app.infrastructure.ai.tokenizer_registry import count_tokens_approx, load_hf_tokenizer

logger = structlog.get_logger("ai.ollama_provider")


class OllamaProvider:
    """Talks to a local (or remote-but-self-hosted) Ollama server's HTTP API. No API key —
    availability is purely "is the server reachable," per MODEL_ROUTER.md §6.1.

    `client` is injectable (same pattern as `application/auth/oauth.py`'s `OAuthCallbackUseCase`)
    so tests can supply an `httpx.MockTransport` instead of hitting a real Ollama server."""

    def __init__(self, base_url: str, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(base_url=base_url, timeout=120.0)
        self._family_cache: dict[str, str] = {}

    async def aclose(self) -> None:
        await self._client.aclose()

    async def complete(
        self,
        messages: list[Message],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: list[Tool] | None = None,
    ) -> CompletionResult:
        payload = self._build_payload(messages, model, temperature, tools, stream=False)
        try:
            response = await self._client.post("/api/chat", json=payload)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ModelUnavailableError(f"Ollama request failed: {exc}") from exc
        return self._parse_response(response.json())

    async def stream(
        self,
        messages: list[Message],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: list[Tool] | None = None,
    ) -> AsyncIterator[StreamChunk]:
        payload = self._build_payload(messages, model, temperature, tools, stream=True)
        try:
            async with self._client.stream("POST", "/api/chat", json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    data: dict[str, Any] = json.loads(line)
                    message: dict[str, Any] = data.get("message", {})
                    tool_calls = self._parse_tool_calls(message.get("tool_calls"))
                    yield StreamChunk(
                        delta=message.get("content", "") or "",
                        finish_reason="stop" if data.get("done") else None,
                        tool_calls=tool_calls,
                    )
        except httpx.HTTPError as exc:
            raise ModelUnavailableError(f"Ollama stream failed: {exc}") from exc

    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        try:
            response = await self._client.post("/api/embed", json={"model": model, "input": texts})
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ModelUnavailableError(f"Ollama embed failed: {exc}") from exc
        body: dict[str, Any] = response.json()
        return list(body["embeddings"])

    async def is_available(self) -> bool:
        try:
            response = await self._client.get("/api/tags")
            return response.status_code == 200
        except httpx.HTTPError:
            return False

    def count_tokens(self, messages: list[Message], model: str) -> int:
        text = "\n".join(m.content or "" for m in messages)
        family = self._family_cache.get(model)
        tokenizer = load_hf_tokenizer(family) if family else None
        if tokenizer is not None:
            return len(tokenizer.encode(text).ids)
        return count_tokens_approx(text)

    async def prefetch_model_family(self, model: str) -> None:
        """Queries `/api/show` for `model`'s family so `count_tokens` can pick the right
        tokenizer. Best-effort and cached — `count_tokens` itself stays synchronous (the
        `AIProvider` protocol requires it), so this must run ahead of time, not lazily inside it."""
        if model in self._family_cache:
            return
        try:
            response = await self._client.post("/api/show", json={"model": model})
            response.raise_for_status()
            body: dict[str, Any] = response.json()
            family = body.get("details", {}).get("family")
        except httpx.HTTPError:
            logger.warning("ollama_show_failed", model=model)
            return
        if family:
            self._family_cache[model] = family

    def _build_payload(
        self,
        messages: list[Message],
        model: str,
        temperature: float,
        tools: list[Tool] | None,
        *,
        stream: bool,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": model,
            "messages": [self._format_message(m) for m in messages],
            "stream": stream,
            "options": {"temperature": temperature},
        }
        if tools:
            payload["tools"] = [self._format_tool(t) for t in tools]
        return payload

    @staticmethod
    def _format_message(message: Message) -> dict[str, Any]:
        formatted: dict[str, Any] = {"role": message.role, "content": message.content or ""}
        if message.tool_calls:
            formatted["tool_calls"] = [
                {"function": {"name": tc.name, "arguments": tc.arguments}} for tc in message.tool_calls
            ]
        return formatted

    @staticmethod
    def _format_tool(tool: Tool) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters,
            },
        }

    @staticmethod
    def _parse_tool_calls(raw: list[dict[str, Any]] | None) -> list[ToolCall] | None:
        if not raw:
            return None
        parsed: list[ToolCall] = []
        for call in raw:
            function: dict[str, Any] = call.get("function", {})
            parsed.append(
                ToolCall(
                    id=str(call.get("id") or uuid4()),
                    name=function.get("name", ""),
                    arguments=function.get("arguments", {}),
                )
            )
        return parsed

    def _parse_response(self, data: dict[str, Any]) -> CompletionResult:
        message: dict[str, Any] = data.get("message", {})
        prompt_tokens: int = data.get("prompt_eval_count", 0)
        completion_tokens: int = data.get("eval_count", 0)
        return CompletionResult(
            content=message.get("content") or None,
            tool_calls=self._parse_tool_calls(message.get("tool_calls")),
            finish_reason="tool_calls" if message.get("tool_calls") else "stop",
            usage=TokenUsage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=prompt_tokens + completion_tokens,
            ),
        )
