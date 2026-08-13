# apps/backend/app/domain/services/

Pure domain logic — functions and classes that implement business rules using only domain models. No I/O, no network calls, no database access.

## Files

| File | Purpose | Status |
|---|---|---|
| `context_builder.py` | Assembles the AI context array from ordered inputs (system, workspace, RAG, history, user message) | Built as `application/chat/context_builder.py` instead — it needs `EmbeddingService`/`EmbeddingRepository` (infrastructure), which this directory's "no I/O" rule rules out living here |
| `token_counter.py` | Counts tokens for a message list; chooses correct tokenizer per model family | Built as `infrastructure/ai/tokenizer_registry.py` instead, for the same reason (needs the tokenizer cache/HF fetch, real I/O) |
| `message_compressor.py` | Compresses conversation history when approaching context window limit | Built as `infrastructure/ai/context_manager.py`'s `truncate_messages()` |
| `path_validator.py` | `resolve_workspace_path()` — validates that a path stays within workspace root | Built, here, pure |
| `chunker.py` | Fixed-size token chunking + file-extension/language classification for RAG indexing (`infrastructure/rag/indexer.py` calls this; the actual filesystem walk lives in `indexer.py` itself, not here, since walking is I/O) | Built, here, pure — added 2026-08-11 |
| `memory_classifier.py` | Classifies extracted text into memory types (architecture, convention, bug, etc.) | Not built — no fact-extraction pipeline exists yet (`MEMORY_SYSTEM.md`) |

## Rules

All functions here are pure (same input → same output, no side effects) and independently testable with no mocking required.
