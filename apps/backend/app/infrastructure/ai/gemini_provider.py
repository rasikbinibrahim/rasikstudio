from __future__ import annotations

from collections.abc import AsyncIterator
from uuid import uuid4

import httpx
from google import genai
from google.genai import types
from google.genai.errors import APIError

from app.core.errors import ModelRateLimitError, ModelUnavailableError, ProviderAuthError
from app.domain.ports.ai_provider import (
    CompletionResult,
    Message,
    StreamChunk,
    TokenUsage,
    Tool,
    ToolCall,
)


class GeminiProvider:
    """Wraps Google's `google-genai` SDK (the actively maintained replacement for the
    now end-of-support `google-generativeai` package named in phase-09-model-router.md).

    Gemini's `Content` uses `role="model"` instead of `"assistant"` and has no `"tool"` role —
    function results are a `"user"`-role `Part.function_response`. That part needs the function
    *name*, which our shared `Message` (role="tool", tool_call_id=...) only carries indirectly:
    `tool_call_id` matches a `ToolCall.id` from an earlier `assistant` message's `tool_calls`
    list in the same conversation (see `base_agent.py`'s ReAct loop — every `role="tool"` message
    is appended immediately after the `assistant` message whose `tool_calls` it responds to).
    `_split_system` builds an id→name map from that history before converting any message, so the
    function_response part always carries Gemini's own function name back, not a bare id.

    `http_client` is injectable (same pattern as `application/auth/oauth.py`'s
    `OAuthCallbackUseCase`) so tests can supply an `httpx.MockTransport`.
    """

    def __init__(self, api_key: str, http_client: httpx.AsyncClient | None = None) -> None:
        self._configured = bool(api_key)
        http_options = types.HttpOptions(httpx_async_client=http_client) if http_client else None
        self._client = genai.Client(api_key=api_key or "unset", http_options=http_options)

    async def aclose(self) -> None:
        await self._client.aio.aclose()

    async def complete(
        self,
        messages: list[Message],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: list[Tool] | None = None,
    ) -> CompletionResult:
        system, contents = self._split_system(messages)
        config = self._build_config(system, temperature, max_tokens, tools)
        try:
            response = await self._client.aio.models.generate_content(
                model=model, contents=contents, config=config
            )
        except APIError as exc:
            raise self._map_error(exc) from exc

        tool_calls = self._extract_tool_calls(response)
        usage = response.usage_metadata
        prompt_tokens = (usage.prompt_token_count if usage else None) or 0
        completion_tokens = (usage.candidates_token_count if usage else None) or 0
        return CompletionResult(
            content=response.text,
            tool_calls=tool_calls,
            finish_reason="tool_calls" if tool_calls else "stop",
            usage=TokenUsage(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=prompt_tokens + completion_tokens,
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
        system, contents = self._split_system(messages)
        config = self._build_config(system, temperature, max_tokens, tools)
        try:
            stream = await self._client.aio.models.generate_content_stream(
                model=model, contents=contents, config=config
            )
            async for chunk in stream:
                tool_calls = self._extract_tool_calls(chunk)
                finish_reason = None
                if chunk.candidates and chunk.candidates[0].finish_reason:
                    finish_reason = chunk.candidates[0].finish_reason.value
                yield StreamChunk(delta=chunk.text or "", finish_reason=finish_reason, tool_calls=tool_calls)
        except APIError as exc:
            raise self._map_error(exc) from exc

    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        try:
            response = await self._client.aio.models.embed_content(model=model, contents=texts)
        except APIError as exc:
            raise self._map_error(exc) from exc
        if not response.embeddings:
            return []
        return [list(e.values or []) for e in response.embeddings]

    async def is_available(self) -> bool:
        if not self._configured:
            return False
        try:
            async for _ in await self._client.aio.models.list(config={"page_size": 1}):
                break
            return True
        except APIError:
            return False

    def count_tokens(self, messages: list[Message], model: str) -> int:
        # Gemini tokenizes server-side (`models.count_tokens` is async-only); this heuristic feeds
        # `context_manager.truncate_messages`, which only needs "roughly how much budget is left,"
        # not an exact count — same tradeoff as `AnthropicProvider.count_tokens`.
        return sum(len(m.content or "") for m in messages) // 4

    @staticmethod
    def _map_error(exc: APIError) -> Exception:
        # Unlike Anthropic/OpenAI, Gemini doesn't return 401/403 for a bad key — it returns
        # `400 INVALID_ARGUMENT` with an "API key not valid" message, so that combination is
        # checked explicitly rather than relying on the HTTP status code alone.
        if exc.code in (401, 403) or (exc.code == 400 and "API key" in (exc.message or "")):
            return ProviderAuthError(f"Gemini rejected the API key: {exc}")
        if exc.code == 429:
            return ModelRateLimitError(f"Gemini rate limit: {exc}")
        return ModelUnavailableError(f"Gemini request failed: {exc}")

    @staticmethod
    def _split_system(messages: list[Message]) -> tuple[str | None, list[types.Content]]:
        system_parts = [m.content for m in messages if m.role == "system" and m.content]
        call_names = GeminiProvider._call_id_to_name(messages)
        contents = [
            GeminiProvider._to_content(m, call_names) for m in messages if m.role != "system"
        ]
        return ("\n".join(system_parts) or None, contents)

    @staticmethod
    def _call_id_to_name(messages: list[Message]) -> dict[str, str]:
        return {tc.id: tc.name for m in messages if m.tool_calls for tc in m.tool_calls}

    @staticmethod
    def _to_content(message: Message, call_names: dict[str, str]) -> types.Content:
        if message.role == "assistant" and message.tool_calls:
            parts = [
                types.Part(function_call=types.FunctionCall(name=tc.name, args=tc.arguments))
                for tc in message.tool_calls
            ]
            return types.Content(role="model", parts=parts)
        if message.role == "tool":
            name = call_names.get(message.tool_call_id or "", message.tool_call_id or "unknown")
            part = types.Part.from_function_response(name=name, response={"result": message.content or ""})
            return types.Content(role="user", parts=[part])
        role = "model" if message.role == "assistant" else "user"
        return types.Content(role=role, parts=[types.Part(text=message.content or "")])

    @staticmethod
    def _build_config(
        system: str | None, temperature: float, max_tokens: int, tools: list[Tool] | None
    ) -> types.GenerateContentConfig:
        config_tools = None
        if tools:
            declarations = [
                types.FunctionDeclaration(
                    name=t.name, description=t.description, parameters_json_schema=t.parameters
                )
                for t in tools
            ]
            config_tools = [types.Tool(function_declarations=declarations)]
        return types.GenerateContentConfig(
            system_instruction=system,
            temperature=temperature,
            max_output_tokens=max_tokens,
            tools=config_tools,
        )

    @staticmethod
    def _extract_tool_calls(response: types.GenerateContentResponse) -> list[ToolCall] | None:
        if not response.candidates or not response.candidates[0].content:
            return None
        parts = response.candidates[0].content.parts or []
        calls = [
            ToolCall(
                id=str(uuid4()),
                name=p.function_call.name or "",
                arguments=dict(p.function_call.args or {}),
            )
            for p in parts
            if p.function_call is not None
        ]
        return calls or None
