# apps/backend/app/core/

Cross-cutting concerns shared by all layers. Nothing in `core/` imports from `api/`, `application/`, `agents/`, `domain/`, or `infrastructure/`.

## Files (to be created in Phase 4)

| File | Purpose |
|---|---|
| `config.py` | `Settings` class (pydantic-settings) — reads all environment variables |
| `security.py` | JWT encode/decode, bcrypt hash/verify, AES-256-GCM encrypt/decrypt, machine-id |
| `logging.py` | structlog configuration, `RequestIDMiddleware`, JSON vs. human-readable format |
| `errors.py` | `RasikStudioError` hierarchy, exception handlers registered on the FastAPI app |
| `events.py` | `startup()` and `shutdown()` lifecycle hooks (DB pool connect, Redis subscribe) |
| `dependencies.py` | FastAPI `Depends()` providers: `get_db()`, `get_redis()`, `get_current_user()`, `get_model_router()`, `get_embedding_service()` |
| `middleware/` | Individual middleware classes |

## Import Rule

`core/` is the lowest layer — it knows nothing about the rest of the application. It provides utilities that everyone else can import.
