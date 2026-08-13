# Ollama — Tokenizer Notes

How this project gets model-specific tokenizer info from `/api/show`, and why it needs to.

## The problem

`AIProvider.count_tokens(messages, model) -> int` is a **synchronous** port method
(`domain/ports/ai_provider.py`) — `context_manager.truncate_messages()` calls it while deciding
how much conversation history fits a model's context window, and that decision has to happen
before any request is sent, with no `await` available at that call site. But loading the *right*
tokenizer for an arbitrary Ollama model (there is no one universal tokenizer — Qwen, Llama,
Mistral, and DeepSeek all use different vocabularies) requires knowing the model's family, which
Ollama only exposes via a real, separate async HTTP call: `POST /api/show`.

## The solution: prefetch, then synchronous lookup from cache

`OllamaProvider.prefetch_model_family(model)` (`ollama_provider.py:105`) is called ahead of time
(at startup / when a model is first selected — the exact call site is `ModelRouter`'s own
resolution path, not `count_tokens()` itself) to resolve and cache `model -> family` in
`self._family_cache: dict[str, str]`. It's best-effort: an `/api/show` failure logs a warning and
leaves the model unmapped rather than raising, so a transient failure here degrades to the
approximation fallback below, not a hard error.

`count_tokens()` (`ollama_provider.py:97`) then does a **pure, synchronous** dictionary lookup —
`self._family_cache.get(model)` — never calling `/api/show` itself. If the family was
successfully prefetched, `tokenizer_registry.load_hf_tokenizer(family)` loads (and caches
per-process) the matching Hugging Face tokenizer and returns a real token count
(`tokenizer.encode(text).ids`, exact, not estimated). If not (never prefetched, or prefetch
failed), it falls back to `count_tokens_approx(text)` — `tiktoken`'s `cl100k_base` approximation,
close enough to drive truncation decisions without being exact.

## `/api/show`'s real response shape used here

```json
{"details": {"family": "qwen2", "parameter_size": "1.5B", "quantization_level": "Q4_K_M"}}
```

Only `details.family` is read (`ollama_provider.py:113`) — `parameter_size`/`quantization_level`
are available in the same response but unused by this project today; a real, available extension
point if a future feature wanted to display model size/quantization in the desktop UI's model
picker.

## The family→tokenizer mapping is intentionally narrow

`tokenizer_registry.py`'s Hugging Face family table covers exactly 4 families: `qwen2`, `llama`,
`mistral`, `deepseek2` — already named in `TASKS.md`'s Phase 9 section as a real, deliberately
narrow scope ("expand the table as new local models are actually adopted, not speculatively").
This analysis confirms the mapping matches what `/api/show` actually reports for those four model
families (verified live against a real Hugging Face tokenizer fetch for Qwen, per `PROGRESS.md`'s
Phase 9 entry) — any other family (e.g. Phi, Gemma, StarCoder) silently falls back to the
`tiktoken` approximation rather than erroring, the same graceful-degradation posture
`prefetch_model_family()`'s own failure path uses.
