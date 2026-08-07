from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Literal, Protocol

# Field-for-field match with MODEL_ROUTER.md §3–4's `ModelProvider`/data-schema example, except
# this is a `Protocol` (structural typing) rather than an `ABC` — domain/ports/README.md's
# repo-wide convention for everything under domain/ports/, chosen so tests can hand a plain
# `FakeAIProvider` dataclass to a use case without inheriting from anything. Implemented by
# `infrastructure/ai/{ollama,anthropic,openai,gemini}_provider.py` in Phase 9.


@dataclass(frozen=True, slots=True)
class ToolCall:
    id: str
    name: str
    arguments: dict[str, object]


@dataclass(frozen=True, slots=True)
class Tool:
    name: str
    description: str
    parameters: dict[str, object]  # JSON Schema


@dataclass(frozen=True, slots=True)
class Message:
    role: Literal["system", "user", "assistant", "tool"]
    content: str | None
    tool_calls: list[ToolCall] | None = None
    tool_call_id: str | None = None


@dataclass(frozen=True, slots=True)
class StreamChunk:
    delta: str
    finish_reason: str | None
    tool_calls: list[ToolCall] | None


@dataclass(frozen=True, slots=True)
class TokenUsage:
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


@dataclass(frozen=True, slots=True)
class CompletionResult:
    content: str | None
    tool_calls: list[ToolCall] | None
    finish_reason: str
    usage: TokenUsage


class AIProvider(Protocol):
    async def complete(
        self,
        messages: list[Message],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: list[Tool] | None = None,
    ) -> CompletionResult: ...

    def stream(
        self,
        messages: list[Message],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: list[Tool] | None = None,
    ) -> AsyncIterator[StreamChunk]: ...

    async def embed(self, texts: list[str], model: str) -> list[list[float]]: ...

    async def is_available(self) -> bool: ...

    def count_tokens(self, messages: list[Message], model: str) -> int: ...
