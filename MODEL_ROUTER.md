# Model Router — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03

---

## 1. Overview

The Model Router is the unified abstraction layer between all application services and AI model providers. It normalizes provider differences, handles streaming, manages token budgets, implements fallback chains, and exposes a single async interface regardless of whether the model is local (Ollama) or cloud (Anthropic, OpenAI, Gemini).

---

## 2. Architecture

```
ChatService / AgentService / CompletionService
                    │
                    ▼
              ModelRouter
         ┌─────────┼──────────┐
         ▼         ▼          ▼
  OllamaProvider  AnthropicProvider  OpenAIProvider
         │                │               │
  Ollama API       Anthropic API      OpenAI API
  (localhost)     (claude.anthropic)  (api.openai.com)
```

---

## 3. Provider Interface (Abstract)

All providers implement a common async interface:

```python
from abc import ABC, abstractmethod
from typing import AsyncIterator

class ModelProvider(ABC):
    
    @abstractmethod
    async def complete(
        self,
        messages: list[Message],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        tools: list[Tool] | None = None,
        stream: bool = False,
    ) -> CompletionResult | AsyncIterator[StreamChunk]:
        ...

    @abstractmethod
    async def embed(self, text: str, model: str) -> list[float]:
        ...

    @abstractmethod
    async def is_available(self) -> bool:
        ...

    @abstractmethod
    def count_tokens(self, messages: list[Message], model: str) -> int:
        ...
```

---

## 4. Data Schemas

```python
@dataclass
class Message:
    role: Literal["system", "user", "assistant", "tool"]
    content: str | None
    tool_calls: list[ToolCall] | None = None
    tool_call_id: str | None = None

@dataclass
class Tool:
    name: str
    description: str
    parameters: dict  # JSON Schema

@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict

@dataclass
class StreamChunk:
    delta: str
    finish_reason: str | None
    tool_calls: list[ToolCall] | None

@dataclass
class CompletionResult:
    content: str | None
    tool_calls: list[ToolCall] | None
    finish_reason: str
    usage: TokenUsage

@dataclass
class TokenUsage:
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
```

---

## 5. Model Router Implementation

```python
class ModelRouter:
    def __init__(self, providers: dict[str, ModelProvider], config: ModelConfig):
        self._providers = providers
        self._config = config

    def _resolve_provider(self, model_id: str) -> tuple[ModelProvider, str]:
        """Maps model_id like 'deepseek-r1:7b' or 'claude-sonnet-4-5' to (provider, model)."""
        if ":" in model_id and not model_id.startswith("claude") and not model_id.startswith("gpt"):
            return self._providers["ollama"], model_id
        if model_id.startswith("claude"):
            return self._providers["anthropic"], model_id
        if model_id.startswith("gpt") or model_id.startswith("o"):
            return self._providers["openai"], model_id
        if model_id.startswith("gemini"):
            return self._providers["gemini"], model_id
        raise ValueError(f"Unknown model: {model_id}")

    async def complete(
        self,
        messages: list[Message],
        model: str,
        stream: bool = False,
        **kwargs,
    ) -> CompletionResult | AsyncIterator[StreamChunk]:
        provider, resolved_model = self._resolve_provider(model)
        
        # Truncate to fit context window
        messages = await self._truncate_messages(messages, resolved_model)
        
        try:
            return await provider.complete(
                messages=messages,
                model=resolved_model,
                stream=stream,
                **kwargs,
            )
        except ModelUnavailableError:
            fallback = self._config.get_fallback(model)
            if fallback:
                log.warning("model_fallback", from_model=model, to_model=fallback)
                return await self.complete(messages, model=fallback, stream=stream, **kwargs)
            raise
```

---

## 6. Provider Implementations

### 6.1 Ollama Provider

```python
class OllamaProvider(ModelProvider):
    def __init__(self, base_url: str = "http://localhost:11434"):
        self._client = httpx.AsyncClient(base_url=base_url, timeout=120)

    async def complete(self, messages, model, stream=False, **kwargs):
        payload = {
            "model": model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "stream": stream,
            "options": {"temperature": kwargs.get("temperature", 0.7)},
        }
        if tools := kwargs.get("tools"):
            payload["tools"] = [self._format_tool(t) for t in tools]
        
        if stream:
            return self._stream(payload)
        
        response = await self._client.post("/api/chat", json=payload)
        response.raise_for_status()
        return self._parse_response(response.json())

    async def _stream(self, payload) -> AsyncIterator[StreamChunk]:
        async with self._client.stream("POST", "/api/chat", json=payload) as r:
            async for line in r.aiter_lines():
                if line:
                    data = json.loads(line)
                    yield StreamChunk(
                        delta=data.get("message", {}).get("content", ""),
                        finish_reason="stop" if data.get("done") else None,
                        tool_calls=None,
                    )
```

### 6.2 Anthropic Provider

Uses the official `anthropic` Python SDK with `async_anthropic.AsyncAnthropic`.

Key differences from Ollama:
- System message must be extracted and passed separately.
- Tool schemas use Anthropic's format.
- Streaming uses `stream()` context manager.

### 6.3 OpenAI Provider

Uses `openai.AsyncOpenAI`. Tool schemas use OpenAI function-calling format.

---

## 7. Token Management

### Context Window Limits

```python
CONTEXT_WINDOWS = {
    "deepseek-r1:7b":        32_768,
    "deepseek-r1:32b":       32_768,
    "qwen2.5:72b":          128_000,
    "qwen2.5-coder:1.5b":   32_768,
    "llama3.3:70b":         128_000,
    "mistral:7b":            32_768,
    "claude-haiku-4-5":     200_000,
    "claude-sonnet-4-5":    200_000,
    "claude-opus-4-8":      200_000,
    "gpt-4o":               128_000,
    "gemini-2.0-flash":   1_048_576,
}
```

### Truncation Strategy

When `count_tokens(messages) > context_window * 0.9`:

1. Preserve system message (always).
2. Preserve last user message (always).
3. Remove oldest messages (pairs of user+assistant) from the middle.
4. Inject a `[Context truncated. Earlier messages omitted.]` system message.
5. Stop when the count fits.

Token counting:
- Ollama: use `tiktoken` approximation (cl100k_base for most models).
- Anthropic: use `anthropic.count_tokens()` API.
- OpenAI: use `tiktoken`.

---

## 8. Streaming Normalization

All providers emit the same `StreamChunk` type. The WebSocket gateway subscribes to the async generator and emits normalized events regardless of provider:

```python
async def stream_to_websocket(
    stream: AsyncIterator[StreamChunk],
    ws_manager: ConnectionManager,
    workspace_id: str,
    message_id: str,
):
    content_buffer = []
    async for chunk in stream:
        if chunk.delta:
            content_buffer.append(chunk.delta)
            await ws_manager.broadcast(workspace_id, {
                "type": "stream_chunk",
                "message_id": message_id,
                "delta": chunk.delta,
            })
        if chunk.finish_reason:
            await ws_manager.broadcast(workspace_id, {
                "type": "stream_end",
                "message_id": message_id,
                "finish_reason": chunk.finish_reason,
            })
    return "".join(content_buffer)
```

---

## 9. Fallback Chain

Configured per feature type in settings:

```yaml
# Default fallback chains
fallback_chains:
  chat:
    - deepseek-r1:7b      # Try local first
    - qwen2.5:72b         # Larger local model
    - claude-sonnet-4-5   # Cloud fallback
  completion:
    - qwen2.5-coder:1.5b  # Fast local
    - deepseek-coder:6.7b
  agent:
    - qwen2.5:72b
    - claude-opus-4-8
  embedding:
    - nomic-embed-text
    - text-embedding-3-small
```

---

## 10. Caching

Non-streaming responses can be cached in Redis:

```python
cache_key = hashlib.sha256(
    json.dumps({"model": model, "messages": messages}, sort_keys=True).encode()
).hexdigest()

if cached := await redis.get(f"model:cache:{cache_key}"):
    return CompletionResult(**json.loads(cached))

result = await provider.complete(...)
await redis.setex(f"model:cache:{cache_key}", 3600, json.dumps(asdict(result)))
```

Caching is disabled for:
- Streaming requests.
- Requests with tools (side effects).
- Agent tasks (need fresh responses).

---

## 11. Model Availability Check

On backend startup and every 60 seconds, a background task pings each provider:

```python
async def check_providers():
    for name, provider in providers.items():
        available = await provider.is_available()
        await redis.set(f"provider:available:{name}", int(available), ex=120)
```

The `/models` endpoint reads these flags to report real-time availability to the frontend.

---

## 12. Error Handling

| Error | Behavior |
|---|---|
| `ModelUnavailableError` | Trigger fallback chain; if all fail, surface error |
| `RateLimitError` | Exponential backoff (1s, 2s, 4s); max 3 retries |
| `ContextWindowExceededError` | Truncate messages; retry once |
| `AuthError` (wrong API key) | Immediately fail; prompt user to update key |
| `TimeoutError` | Retry once; if still fails, surface error |
| `NetworkError` | Trigger fallback to local model |
