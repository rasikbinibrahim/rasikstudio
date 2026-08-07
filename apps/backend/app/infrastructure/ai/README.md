# apps/backend/app/infrastructure/ai/

AI provider implementations and the model router. Implements the `AIProvider` port from `domain/ports/ai_provider.py`.

## Files

| File | Purpose |
|---|---|
| `ollama_provider.py` | `OllamaProvider` — httpx to local Ollama API; NDJSON streaming |
| `anthropic_provider.py` | `AnthropicProvider` — official `anthropic` SDK, `messages.stream()` |
| `openai_provider.py` | `OpenAIProvider` — official `openai` SDK, Chat Completions streaming |
| `gemini_provider.py` | `GeminiProvider` — `google-genai` SDK (see note below) |
| `model_router.py` | `ModelRouter` — resolves provider from model string, fallback chains, response caching |
| `context_manager.py` | `CONTEXT_WINDOWS` table, message truncation algorithm |
| `tokenizer_registry.py` | Ollama-family → Hugging Face tokenizer mapping, with a `tiktoken` fallback |
| `embedding_service.py` | `EmbeddingService` — batched embedding calls + the `embedding` fallback chain |
| `availability_checker.py` | `ProviderAvailabilityChecker` — background task backing `GET /api/v1/models` |
| `providers.py` | `build_providers()`/`close_providers()` + the `ai_providers` module-level singleton |

`base_provider.py` from the original phase-09 plan doesn't exist separately — `AIProvider`,
`StreamChunk`, `TokenUsage`, `Message`, `Tool`, `ToolCall`, and `CompletionResult` all live in
`domain/ports/ai_provider.py` (built in an earlier phase); duplicating them here would just be
the same types under two names.

## `google-generativeai` → `google-genai`

The package named in `phase-09-model-router.md` (`google-generativeai`) reached end-of-support
upstream — importing it now raises a `FutureWarning` pointing integrators at `google-genai`, the
actively maintained SDK. `GeminiProvider` uses `google-genai`; see its docstring for the API
differences that mattered (role names, no `httpx.AsyncClient` injection point — `http_options`
instead).

## Token Counting Correction

Each Ollama model uses its own tokenizer — not `cl100k_base` for everything. `OllamaProvider`
queries `/api/show` for the model's `details.family` (`prefetch_model_family`, since
`AIProvider.count_tokens` is synchronous and can't do the lookup itself) and looks it up in
`tokenizer_registry.py`'s family → Hugging Face repo table. An unmapped family, or a repo fetch
that fails (no network), falls back to the `tiktoken` `cl100k_base` approximation — logged, not
silent — since token counting only drives `context_manager`'s truncation heuristic, not the
actual request sent to the model.

Anthropic and Gemini don't publish a local tokenizer at all (both tokenize server-side); their
`count_tokens()` uses a `len(text) // 4` heuristic for the same reason.

## Embedding Batching

`EmbeddingService.embed()` accepts `list[str]` and calls the embedding API with the full batch in
one request, not one item at a time — this is what `AIProvider.embed()` itself does per provider;
`EmbeddingService` only adds the `embedding` fallback chain on top. Batching this way is what
turns initial RAG indexing from ~minutes into ~seconds on a real codebase.
