# apps/backend/app/infrastructure/ai/

AI provider implementations and the model router. Implements the `AIProvider` port from `domain/ports/ai_provider.py`.

## Files (to be created in Phase 9)

| File | Purpose |
|---|---|
| `base_provider.py` | `AIProvider` Protocol, `StreamChunk`, `TokenUsage` dataclasses |
| `ollama_provider.py` | `OllamaProvider` — httpx to local Ollama API; NDJSON streaming |
| `anthropic_provider.py` | `AnthropicProvider` — official `anthropic` SDK, `AsyncMessageStream` |
| `openai_provider.py` | `OpenAIProvider` — official `openai` SDK, `AsyncStream` |
| `gemini_provider.py` | `GeminiProvider` — `google-generativeai` SDK |
| `model_router.py` | `ModelRouter` — resolves provider from model string, fallback chains, response caching |
| `context_manager.py` | Token counting, context window truncation, model-specific tokenizer loading |
| `embedding_service.py` | `EmbeddingService` — batched embedding API calls (not one-at-a-time) |

## Token Counting Correction

Each Ollama model uses its own tokenizer — not `cl100k_base`. Query `/api/show` for `tokenizer_info` and use the Hugging Face `tokenizers` library for accurate counting. See ADR 0007 and Review Report §3.2.

## Embedding Batching

`EmbeddingService.embed()` accepts `list[str]` and calls the embedding API with the full batch, not one item at a time. This reduces initial RAG indexing time from ~minutes to ~seconds.
