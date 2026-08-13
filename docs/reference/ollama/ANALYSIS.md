# Ollama — Reference Analysis

**Studied as of:** 2026-08-12. Ollama is a local model-serving daemon: a single Go binary that
downloads, manages, and serves GGUF-format LLMs over a local HTTP API, handling GPU/CPU
offloading and model quantization transparently. Referenced for this project's local-AI story
(`OllamaProvider`, `apps/backend/app/infrastructure/ai/ollama_provider.py`) — the default
chat/completion model this project targets (`MODEL_ROUTER.md`'s Decisions Log:
`qwen2.5-coder:1.5b` for completion, DeepSeek-R1 7B for chat) is expected to run through Ollama.

## 1. Architecture

A background daemon (`ollama serve`) exposes a REST API on `localhost:11434`; the `ollama` CLI is
a thin client of that same API. Models are pulled from Ollama's own registry (content-addressed,
similar in spirit to a container registry) as GGUF files plus a `Modelfile` (parameters, system
prompt template, stop tokens). The daemon manages which models are loaded into GPU/CPU memory,
evicting idle ones under memory pressure — the caller never manages model lifecycle directly,
only ever sends a request naming a model id and the daemon loads it on demand if not already
resident. This project's `OllamaProvider` is a pure HTTP client of that daemon — no model
lifecycle management on this project's side at all, which is the correct division of
responsibility (Ollama already solves "which models are loaded, evict what, GPU vs CPU
placement" well; re-implementing any of that here would be pure duplicated effort).

## 2. Folder Structure

Not directly relevant to this project (Ollama is consumed as an external service, its own Go
source isn't studied for architecture reuse) beyond understanding its API surface, covered in
`API_NOTES.md`.

## 3. Design Patterns

- **NDJSON streaming** — `/api/chat`/`/api/generate` with `"stream": true` return newline-
  delimited JSON objects, one per token/chunk, the connection closing after a final object with
  `"done": true`. This project's `OllamaProvider.stream()` parses exactly this shape
  (`response.aiter_lines()` → `json.loads(line)` per line, `ollama_provider.py:64-76`) — the
  simplest possible streaming transport (no SSE framing, no chunked-transfer-encoding parsing
  beyond what httpx already does), which is part of why implementing a new provider against
  Ollama's API is materially less code than Anthropic's or OpenAI's SSE-based streaming.
- **Model introspection via `/api/show`** — returns a model's family, parameter count,
  quantization, and template, all metadata this project actually consumes:
  `OllamaProvider.prefetch_model_family()` (`ollama_provider.py:103`) queries this specifically to
  learn a model's `details.family` so `tokenizer_registry.py` can load a matching Hugging Face
  tokenizer for accurate token counting (`MODEL_ROUTER.md` §7) — a real, working integration this
  analysis confirms matches Ollama's actual documented API shape, not a guess.
- **No API key, availability = reachability** — Ollama has no authentication concept for its
  local API (by design; it assumes the caller already has local machine access). This project's
  `OllamaProvider.is_available()` reflects that directly: a bare `GET /api/tags` returning 200,
  nothing else to check (`ollama_provider.py:89`) — the simplest of this project's four providers'
  `is_available()` implementations, since Ollama alone has no key to validate.

## 4. Dependencies

None from this project's side beyond `httpx` (already a dependency for every provider). Ollama
itself is a separate binary this project does not bundle, package, or manage installation of —
the user installs and runs it independently; `OllamaProvider.is_available()`'s negative case
(server absent) is a real, expected, non-error state this project handles gracefully throughout
(`ModelRouter`'s fallback chains, `GET /api/v1/models`'s live availability flags).

## 5. Build Process

Not applicable — external service, no build integration on this project's side.

## 6. Features

Model pull/list/delete/copy via CLI or API; a `Modelfile` format for customizing a base model's
system prompt/parameters without fine-tuning; GPU auto-detection (CUDA/ROCm/Metal) with automatic
layer offloading when a model doesn't fully fit in VRAM; multi-model concurrent serving (bounded
by `OLLAMA_MAX_LOADED_MODELS`). This project uses none of the customization features (no
`Modelfile` authored by this project) — it treats Ollama purely as an inference backend for
whatever models the user has already pulled.

## 7. Strengths

- Zero-friction local model serving — a single binary, no Python environment/CUDA-toolchain setup
  burden on the end user, which is exactly why this project treats it as the default local
  provider rather than e.g. requiring users to run their own `transformers`-based serving stack.
- The REST API is genuinely simple and stable, which is why implementing `OllamaProvider` was
  straightforward relative to the cloud providers (see `PROGRESS.md`'s Phase 9 entry: Ollama's
  `is_available()` was the one provider verified against this environment's *real* absent local
  server, confirming the negative case for real, not just mocked).
- `/api/show`'s family metadata (§3) is a real, useful integration point this project actually
  uses for tokenizer selection — not every local-serving tool exposes this.

## 8. Weaknesses

- No authentication means Ollama's API should never be exposed beyond localhost without a reverse
  proxy adding its own auth layer — not this project's concern directly (it only ever talks to a
  local Ollama instance), but worth naming for `SECURITY_GUIDELINES.md` if remote-Ollama support
  is ever considered.
- **Resolved 2026-08-13:** model management (pull progress, disk usage) previously had no UI in
  this project at all. A real Settings-panel UI now exists (`OllamaModelsSection.tsx`) backed by
  `app/infrastructure/ai/ollama_registry.py` and 3 new `/api/v1/models/ollama/*` endpoints —
  list/pull (real streamed progress)/remove. See `TASKS.md`'s entry under "Discovered during the
  2026-08-12 reference-repository analysis" and `CHANGELOG.md`'s 2026-08-13 entry for the full
  writeup.
- `tokenizer_registry.py`'s Hugging Face family mapping only covers 4 families (already tracked in
  `TASKS.md`, Phase 9 section) — any Ollama model outside `qwen2`/`llama`/`mistral`/`deepseek2`
  falls back to a `tiktoken` approximation, a real, already-named limitation this analysis
  confirms rather than newly discovers.

## 9. Reusable Modules

None — Ollama is consumed as an external HTTP service, not a library; there is no "module" to
import, only an API contract to implement a client against (already done,
`OllamaProvider`/`AGENT_FRAMEWORK.md`).

## 10. Modules That Should Be Rewritten

Not applicable.

## 11. License Requirements

See `LICENSE_NOTES.md`.
