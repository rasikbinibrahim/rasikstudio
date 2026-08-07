from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any, cast

import anthropic
import httpx
import structlog
from anthropic.types import MessageParam, ToolParam

from app.core.errors import ModelRateLimitError, ModelUnavailableError, ProviderAuthError
from app.domain.ports.ai_provider import (
    CompletionResult,
    Message,
    StreamChunk,
    TokenUsage,
    Tool,
    ToolCall,
)

logger = structlog.get_logger("ai.anthropic_provider")


class AnthropicProvider:
    """Wraps the official `anthropic` SDK's `AsyncAnthropic` client. Anthropic's Messages API
    takes the system prompt as a separate top-level `system` parameter rather than a message with
    `role="system"`, so every call here splits it out first — per MODEL_ROUTER.md §6.2.

    `http_client` is injectable (same pattern as `application/auth/oauth.py`'s
    `OAuthCallbackUseCase`) so tests can supply an `httpx.MockTransport`."""

    def __init__(self, api_key: str, http_client: httpx.AsyncClient | None = None) -> None:
        self._configured = bool(api_key)
        self._client = anthropic.AsyncAnthropic(api_key=api_key or "unset", http_client=http_client)

    async def aclose(self) -> None:
        await self._client.close()

    async def complete(
        self,
        messages: list[Message],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: list[Tool] | None = None,
    ) -> CompletionResult:
        system, converted = self._split_system(messages)
        try:
            response = await self._client.messages.create(
                model=model,
                system=system or anthropic.omit,
                messages=cast("list[MessageParam]", converted),
                max_tokens=max_tokens,
                temperature=temperature,
                tools=cast("list[ToolParam]", [self._format_tool(t) for t in tools])
                if tools
                else anthropic.omit,
            )
        except anthropic.RateLimitError as exc:
            raise ModelRateLimitError(f"Anthropic rate limit: {exc}") from exc
        except anthropic.AuthenticationError as exc:
            raise ProviderAuthError(f"Anthropic rejected the API key: {exc}") from exc
        except anthropic.APIError as exc:
            raise ModelUnavailableError(f"Anthropic request failed: {exc}") from exc

        text_parts = [block.text for block in response.content if block.type == "text"]
        tool_calls = [
            ToolCall(id=block.id, name=block.name, arguments=dict(block.input))
            for block in response.content
            if block.type == "tool_use"
        ]
        return CompletionResult(
            content="".join(text_parts) or None,
            tool_calls=tool_calls or None,
            finish_reason=response.stop_reason or "stop",
            usage=TokenUsage(
                prompt_tokens=response.usage.input_tokens,
                completion_tokens=response.usage.output_tokens,
                total_tokens=response.usage.input_tokens + response.usage.output_tokens,
            ),
        )

    async def stream(
        self,
        messages: list[Message],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: list[Tool] | None = None,
    ) -> AsyncIterator[StreamChunk]:
        system, converted = self._split_system(messages)
        # Accumulates `input_json_delta` fragments per content-block index, since Anthropic
        # streams a tool call's arguments as incremental partial-JSON strings rather than one
        # shot — only assembled into a `ToolCall` once its block closes.
        pending_tool: dict[str, Any] | None = None
        pending_json = ""
        try:
            async with self._client.messages.stream(
                model=model,
                system=system or anthropic.omit,
                messages=cast("list[MessageParam]", converted),
                max_tokens=max_tokens,
                temperature=temperature,
                tools=cast("list[ToolParam]", [self._format_tool(t) for t in tools])
                if tools
                else anthropic.omit,
            ) as stream:
                async for event in stream:
                    if event.type == "content_block_start" and event.content_block.type == "tool_use":
                        pending_tool = {"id": event.content_block.id, "name": event.content_block.name}
                        pending_json = ""
                    elif event.type == "content_block_delta":
                        if event.delta.type == "text_delta":
                            yield StreamChunk(delta=event.delta.text, finish_reason=None, tool_calls=None)
                        elif event.delta.type == "input_json_delta":
                            pending_json += event.delta.partial_json
                    elif event.type == "content_block_stop" and pending_tool is not None:
                        arguments = json.loads(pending_json) if pending_json else {}
                        tool_call = ToolCall(
                            id=pending_tool["id"], name=pending_tool["name"], arguments=arguments
                        )
                        yield StreamChunk(delta="", finish_reason=None, tool_calls=[tool_call])
                        pending_tool = None
                    elif event.type == "message_delta" and event.delta.stop_reason:
                        yield StreamChunk(delta="", finish_reason=event.delta.stop_reason, tool_calls=None)
        except anthropic.RateLimitError as exc:
            raise ModelRateLimitError(f"Anthropic rate limit: {exc}") from exc
        except anthropic.AuthenticationError as exc:
            raise ProviderAuthError(f"Anthropic rejected the API key: {exc}") from exc
        except anthropic.APIError as exc:
            raise ModelUnavailableError(f"Anthropic stream failed: {exc}") from exc

    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        # Anthropic doesn't offer an embeddings API — `ModelRouter`'s fallback chain is expected
        # to route `embedding` requests past this provider to Ollama/OpenAI instead.
        raise ModelUnavailableError("Anthropic does not provide an embeddings API")

    async def is_available(self) -> bool:
        if not self._configured:
            return False
        try:
            async for _ in self._client.models.list(limit=1):
                break
            return True
        except anthropic.APIError:
            return False

    def count_tokens(self, messages: list[Message], model: str) -> int:
        # `messages.count_tokens` is an async API call (Anthropic tokenizes server-side, no local
        # tokenizer is published) — `AIProvider.count_tokens` is synchronous per the domain port,
        # so this uses the same local heuristic `context_manager.truncate_messages` needs: enough
        # accuracy to decide *whether* to truncate, not an exact billing count.
        return sum(len(m.content or "") for m in messages) // 4

    @staticmethod
    def _split_system(messages: list[Message]) -> tuple[str | None, list[dict[str, Any]]]:
        system_parts = [m.content for m in messages if m.role == "system" and m.content]
        converted = [
            {"role": m.role, "content": m.content or ""} for m in messages if m.role != "system"
        ]
        return ("\n".join(system_parts) or None, converted)

    @staticmethod
    def _format_tool(tool: Tool) -> dict[str, Any]:
        return {
            "name": tool.name,
            "description": tool.description,
            "input_schema": tool.parameters,
        }
