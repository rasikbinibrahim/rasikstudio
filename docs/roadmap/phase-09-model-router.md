# Phase 9 — Model Router

**Part of:** [Implementation Roadmap](README.md)
**Depends on:** Phase 4
**Estimated effort:** 2 weeks

---

## Objective

Build the model abstraction layer: a unified interface across Ollama, Anthropic, OpenAI, and Gemini providers, with streaming normalization, fallback chains, context window management, and response caching. By the end of this phase, any backend service can call `model_router.complete()` without knowing which provider is handling the request.

## Architecture

**Provider abstraction:**
```python
class AIProvider(Protocol):
    async def complete(messages, model, stream, tools, max_tokens) -> AsyncIterator[StreamChunk]
    async def embed(texts: list[str]) -> list[list[float]]
    async def is_available() -> bool
    def count_tokens(messages) -> int
```

**Implementations:**
- `OllamaProvider` — httpx to local Ollama API, streaming via NDJSON
- `AnthropicProvider` — official `anthropic` SDK, streaming via `AsyncMessageStream`
- `OpenAIProvider` — official `openai` SDK, streaming via `AsyncStream`
- `GeminiProvider` — `google-generativeai` SDK

**Model resolution (from model string prefix):**
- `*:*` (colon separator) → `OllamaProvider` (e.g., `deepseek-r1:14b`)
- `claude-*` → `AnthropicProvider`
- `gpt-*`, `o*` → `OpenAIProvider`
- `gemini-*` → `GeminiProvider`

**Token counting:** For Ollama models, query `/api/show` to get `tokenizer_info` and use the model-specific tokenizer via the `tokenizers` library — not `cl100k_base` for every model.

**Streaming normalization:** All providers emit a common `StreamChunk`:
```python
@dataclass
class StreamChunk:
    delta: str | None
    finish_reason: str | None
    tool_calls: list[ToolCall] | None
    usage: TokenUsage | None
```

**Context truncation:** When input exceeds context window: preserve system prompt + last user message, summarize middle pairs, inject `[CONTEXT TRUNCATED: {n} messages summarized]` marker.

**Caching:** Non-streaming, non-tool-call responses cached in Redis (1h TTL). Cache key = SHA-256(model + messages JSON).

**Fallback chains:** Configured per feature type in `config/fallback_chains.yaml`:
```yaml
chat: [deepseek-r1:7b, claude-sonnet-4-5, gpt-4o-mini]
completion: [qwen2.5-coder:1.5b, deepseek-coder:1.3b]
embedding: [nomic-embed-text, text-embedding-3-small]
```

## Dependencies

- Phase 4 complete (backend foundation)
- `anthropic`, `openai`, `google-generativeai`
- `httpx` (for Ollama)
- `tokenizers` (Hugging Face — for model-specific token counting)

## Files to Create

- `app/infrastructure/ai/base_provider.py` — `AIProvider` Protocol, `StreamChunk`, `TokenUsage`
- `app/infrastructure/ai/ollama_provider.py` — `OllamaProvider`
- `app/infrastructure/ai/anthropic_provider.py` — `AnthropicProvider`
- `app/infrastructure/ai/openai_provider.py` — `OpenAIProvider`
- `app/infrastructure/ai/gemini_provider.py` — `GeminiProvider`
- `app/infrastructure/ai/model_router.py` — `ModelRouter` (resolve provider, fallback, cache)
- `app/infrastructure/ai/context_manager.py` — token counting, truncation, context building
- `app/infrastructure/ai/embedding_service.py` — `EmbeddingService` (wraps OllamaProvider + fallback, batched calls)
- `config/fallback_chains.yaml`
- `app/api/v1/models.py` — `GET /models` (list), `GET /models/{model}` (info)

## Files to Modify

- `app/api/v1/__init__.py` — include models router
- `app/core/dependencies.py` — add `get_model_router()` dependency

## Acceptance Criteria

- [ ] `OllamaProvider.is_available()` returns `True` when Ollama is running, `False` when it is not
- [ ] `ModelRouter.complete()` with a local model streams tokens to the caller
- [ ] `ModelRouter.complete()` with a cloud model streams tokens when the API key is configured
- [ ] Provider availability check runs every 60s (background task)
- [ ] Fallback: if primary model is unavailable, automatically tries next model in chain
- [ ] Context truncation: messages exceeding context window are correctly truncated with marker
- [ ] `EmbeddingService.embed(["hello", "world"])` returns two 768-dimensional vectors in a single batched call
- [ ] Response cache: identical non-streaming requests return cached response (check Redis key exists)
- [ ] Token counting: `count_tokens()` for a Qwen model uses Qwen's tokenizer, not `cl100k_base`
- [ ] `GET /api/v1/models` returns list of available models from all configured providers
- [ ] `mypy app/infrastructure/ai/` passes with zero errors

## Testing Strategy

- **Unit tests:** Provider resolution by model string, context truncation algorithm, cache key generation
- **Integration tests:** Real Ollama requests (test environment must have Ollama running), fallback chain (mock primary unavailable)
- **Manual:** Stream a long response and verify tokens arrive incrementally in the desktop client

## Estimated Effort

**2 weeks**
- Week 1: Provider implementations (Ollama, Anthropic, OpenAI), streaming normalization
- Week 2: ModelRouter (resolution, fallback, caching), context manager, token counting, API endpoints
