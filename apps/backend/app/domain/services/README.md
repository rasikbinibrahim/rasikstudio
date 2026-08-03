# apps/backend/app/domain/services/

Pure domain logic — functions and classes that implement business rules using only domain models. No I/O, no network calls, no database access.

## Files (to be created in Phase 4 and Phase 9)

| File | Purpose |
|---|---|
| `context_builder.py` | Assembles the AI context array from ordered inputs (system, workspace, RAG, history, user message) |
| `token_counter.py` | Counts tokens for a message list; chooses correct tokenizer per model family |
| `message_compressor.py` | Compresses conversation history when approaching context window limit |
| `path_validator.py` | `resolve_workspace_path()` — validates that a path stays within workspace root |
| `memory_classifier.py` | Classifies extracted text into memory types (architecture, convention, bug, etc.) |

## Rules

All functions here are pure (same input → same output, no side effects) and independently testable with no mocking required.
