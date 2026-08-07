from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any, cast
from uuid import uuid4

import httpx
import openai
import structlog
import tiktoken
from openai.types.chat import ChatCompletionMessageParam, ChatCompletionToolParam

from app.core.errors import ModelRateLimitError, ModelUnavailableError, ProviderAuthError
from app.domain.ports.ai_provider import (
    CompletionResult,
    Message,
    StreamChunk,
    TokenUsage,
    Tool,
    ToolCall,
)

logger = structlog.get_logger("ai.openai_provider")


class OpenAIProvider:
    """Wraps the official `openai` SDK's `AsyncOpenAI` client against the Chat Completions API.

    `http_client` is injectable (same pattern as `application/auth/oauth.py`'s
    `OAuthCallbackUseCase`) so tests can supply an `httpx.MockTransport`."""

    def __init__(self, api_key: str, http_client: httpx.AsyncClient | None = None) -> None:
        self._configured = bool(api_key)
        self._client = openai.AsyncOpenAI(api_key=api_key or "unset", http_client=http_client)

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
        try:
            response = await self._client.chat.completions.create(
                model=model,
                messages=self._format_messages(messages),
                max_completion_tokens=max_tokens,
                temperature=temperature,
                tools=cast("list[ChatCompletionToolParam]", [self._format_tool(t) for t in tools])
                if tools
                else openai.omit,
            )
        except openai.RateLimitError as exc:
            raise ModelRateLimitError(f"OpenAI rate limit: {exc}") from exc
        except openai.AuthenticationError as exc:
            raise ProviderAuthError(f"OpenAI rejected the API key: {exc}") from exc
        except openai.APIError as exc:
            raise ModelUnavailableError(f"OpenAI request failed: {exc}") from exc

        choice = response.choices[0]
        usage = response.usage
        return CompletionResult(
            content=choice.message.content,
            tool_calls=self._parse_tool_calls(choice.message.tool_calls),
            finish_reason=choice.finish_reason or "stop",
            usage=TokenUsage(
                prompt_tokens=usage.prompt_tokens if usage else 0,
                completion_tokens=usage.completion_tokens if usage else 0,
                total_tokens=usage.total_tokens if usage else 0,
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
        # Tool-call arguments arrive as incremental JSON-string fragments keyed by index, same
        # shape as Anthropic's `input_json_delta` — assembled once `finish_reason` closes the turn.
        pending_calls: dict[int, dict[str, Any]] = {}
        try:
            response = await self._client.chat.completions.create(
                model=model,
                messages=self._format_messages(messages),
                max_completion_tokens=max_tokens,
                temperature=temperature,
                tools=cast("list[ChatCompletionToolParam]", [self._format_tool(t) for t in tools])
                if tools
                else openai.omit,
                stream=True,
            )
            async for chunk in response:
                choice = chunk.choices[0] if chunk.choices else None
                if choice is None:
                    continue
                delta = choice.delta
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        entry = pending_calls.setdefault(tc.index, {"id": None, "name": "", "arguments": ""})
                        if tc.id:
                            entry["id"] = tc.id
                        if tc.function and tc.function.name:
                            entry["name"] += tc.function.name
                        if tc.function and tc.function.arguments:
                            entry["arguments"] += tc.function.arguments
                if choice.finish_reason:
                    tool_calls = self._finalize_pending_calls(pending_calls) if pending_calls else None
                    yield StreamChunk(
                        delta=delta.content or "", finish_reason=choice.finish_reason, tool_calls=tool_calls
                    )
                elif delta.content:
                    yield StreamChunk(delta=delta.content, finish_reason=None, tool_calls=None)
        except openai.RateLimitError as exc:
            raise ModelRateLimitError(f"OpenAI rate limit: {exc}") from exc
        except openai.AuthenticationError as exc:
            raise ProviderAuthError(f"OpenAI rejected the API key: {exc}") from exc
        except openai.APIError as exc:
            raise ModelUnavailableError(f"OpenAI stream failed: {exc}") from exc

    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        try:
            response = await self._client.embeddings.create(model=model, input=texts)
        except openai.RateLimitError as exc:
            raise ModelRateLimitError(f"OpenAI rate limit: {exc}") from exc
        except openai.AuthenticationError as exc:
            raise ProviderAuthError(f"OpenAI rejected the API key: {exc}") from exc
        except openai.APIError as exc:
            raise ModelUnavailableError(f"OpenAI embed failed: {exc}") from exc
        return [item.embedding for item in response.data]

    async def is_available(self) -> bool:
        if not self._configured:
            return False
        try:
            await self._client.models.list(timeout=5.0)
            return True
        except openai.APIError:
            return False

    def count_tokens(self, messages: list[Message], model: str) -> int:
        try:
            encoding = tiktoken.encoding_for_model(model)
        except KeyError:
            encoding = tiktoken.get_encoding("cl100k_base")
        return sum(len(encoding.encode(m.content or "")) for m in messages)

    @staticmethod
    def _format_messages(messages: list[Message]) -> list[ChatCompletionMessageParam]:
        return cast(
            "list[ChatCompletionMessageParam]",
            [OpenAIProvider._format_message(m) for m in messages],
        )

    @staticmethod
    def _format_message(message: Message) -> dict[str, Any]:
        formatted: dict[str, Any] = {"role": message.role, "content": message.content}
        if message.tool_calls:
            formatted["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.name, "arguments": json.dumps(tc.arguments)},
                }
                for tc in message.tool_calls
            ]
        if message.tool_call_id:
            formatted["tool_call_id"] = message.tool_call_id
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
    def _parse_tool_calls(raw: list[Any] | None) -> list[ToolCall] | None:
        if not raw:
            return None
        return [
            ToolCall(
                id=tc.id or str(uuid4()),
                name=tc.function.name,
                arguments=json.loads(tc.function.arguments or "{}"),
            )
            for tc in raw
        ]

    @staticmethod
    def _finalize_pending_calls(pending: dict[int, dict[str, Any]]) -> list[ToolCall]:
        return [
            ToolCall(
                id=entry["id"] or str(uuid4()),
                name=entry["name"],
                arguments=json.loads(entry["arguments"]) if entry["arguments"] else {},
            )
            for entry in pending.values()
        ]
