# Ollama — API Notes

Endpoints, request/response shapes, and streaming (NDJSON), as actually consumed by
`OllamaProvider` (`apps/backend/app/infrastructure/ai/ollama_provider.py`).

## `POST /api/chat`

Request:

```json
{
  "model": "qwen2.5-coder:1.5b",
  "messages": [{"role": "user", "content": "...", "tool_calls": [...]}],
  "stream": true,
  "options": {"temperature": 0.7},
  "tools": [{"type": "function", "function": {"name": "...", "description": "...", "parameters": {...}}}]
}
```

`_build_payload()` (`ollama_provider.py:121`) builds exactly this shape — `tools` is omitted
entirely when the caller passes none (not sent as an empty list), and every `Message` is
reformatted per `_format_message()`: role/content pass through directly, and a `tool_calls` list
(when the message is an `assistant` message reporting what it called) is reshaped into Ollama's
`{"function": {"name", "arguments"}}` wrapper — Ollama's own native function-calling format,
matching OpenAI's shape closely (both trace back to the same emerging convention most local model
serving tools converged on).

**Non-streaming response** (`"stream": false`):

```json
{
  "message": {"role": "assistant", "content": "...", "tool_calls": [...]},
  "prompt_eval_count": 42,
  "eval_count": 17
}
```

`_parse_response()` reads `prompt_eval_count`/`eval_count` directly as prompt/completion token
counts — Ollama reports real counts from its own inference run (not an estimate), which is why
`OllamaProvider` doesn't need `count_tokens()`'s tokenizer-based estimate for *usage reporting*,
only for *pre-flight context-window truncation* (`context_manager.truncate_messages()`, which
needs a token estimate before the request is even sent, when no real count exists yet).

## Streaming: NDJSON, not SSE

`"stream": true` returns one JSON object per line (newline-delimited, not `data: ...`-prefixed
SSE, and not a single JSON array) until a final object with `"done": true`:

```
{"message": {"role": "assistant", "content": "The"}, "done": false}
{"message": {"role": "assistant", "content": " answer"}, "done": false}
{"message": {"role": "assistant", "content": " is"}, "done": true}
```

`OllamaProvider.stream()` (`ollama_provider.py:55`) reads this via `response.aiter_lines()`,
`json.loads()`-ing each non-empty line directly — no SSE-framing parser needed, unlike
`AnthropicProvider`/`OpenAIProvider`'s streaming, both of which use real SSE (`data: {...}\n\n`
framing) and need httpx's/the SDK's own SSE-aware iteration instead. This is the concrete reason
Ollama was the simplest of this project's four providers to implement a working streaming path
for.

## `GET /api/tags` — availability check

Returns the list of locally pulled models. `OllamaProvider.is_available()` only checks for a
`200` status, ignoring the body entirely (`ollama_provider.py:89`) — "the daemon is reachable" is
the only thing this project's `is_available()` contract needs (per `domain/ports/ai_provider.py`'s
Protocol), not "is this specific model pulled." A request for a model that isn't locally pulled
would instead surface as a real error from `/api/chat` itself (Ollama auto-pulls in some CLI
flows, but the HTTP API returns a 404 for an unknown model rather than triggering a pull), mapped
by this provider to `ModelUnavailableError` like any other HTTP failure.

## `POST /api/embed`

```json
{"model": "nomic-embed-text", "input": ["hello", "world"]}
```

returns `{"embeddings": [[...], [...]]}` — a real batched call (both strings in one request, one
response with both vectors), which is exactly the batching behavior `EmbeddingService`'s own
Phase 9 acceptance criterion required and verified (`PROGRESS.md`'s Phase 9 entry: "sends the full
batch in one provider call").

## `POST /api/show` — model introspection

See `TOKENIZER_NOTES.md` for how this project uses this endpoint specifically.
