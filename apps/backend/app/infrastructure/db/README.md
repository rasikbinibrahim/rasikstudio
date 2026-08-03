# apps/backend/app/infrastructure/db/

SQLAlchemy ORM layer: async engine, session factory, ORM model definitions, and repository implementations.

## Subdirectories

| Directory | Contents |
|---|---|
| `models/` | SQLAlchemy ORM class definitions (one file per domain area) |
| `repositories/` | Concrete implementations of domain repository ports |

## Files at This Level (to be created in Phase 4 and Phase 5)

| File | Purpose |
|---|---|
| `session.py` | Async SQLAlchemy engine, `AsyncSessionLocal`, `get_db()` async generator |

## Connection Pool Configuration

```python
pool_size=10
max_overflow=20
pool_pre_ping=True      # validate connections before use
pool_recycle=3600       # recycle connections hourly
```

## Async Rule

Every database call uses `await`. Never call `session.execute()` without `await`. Never use synchronous SQLAlchemy in an async context — it blocks the event loop.
