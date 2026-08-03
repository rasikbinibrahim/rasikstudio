# apps/backend/tests/unit/infrastructure/ai/

Unit tests for AI provider implementations and the model router (with mocked HTTP).

Key scenarios:
- `ModelRouter`: resolves `deepseek-r1:7b` to `OllamaProvider`
- `ModelRouter`: resolves `claude-sonnet-4-5` to `AnthropicProvider`
- `ModelRouter`: primary provider unavailable → falls back to next in chain
- `ModelRouter`: caches non-streaming response in Redis (mock Redis)
- `OllamaProvider`: NDJSON streaming output is parsed into `StreamChunk` sequence
- `EmbeddingService`: calls embedding API with full batch (not one-at-a-time) — verify mock call count
- `context_manager.py`: truncation removes middle messages and inserts `[CONTEXT TRUNCATED]` marker
