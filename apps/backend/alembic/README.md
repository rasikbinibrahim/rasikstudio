# apps/backend/alembic/

Alembic database migration management. This directory controls the version history of the PostgreSQL schema.

## Files

| File | Purpose |
|---|---|
| `env.py` | Alembic environment — connects to the async SQLAlchemy engine, imports all ORM models |
| `versions/` | Individual migration scripts, one per schema change |

## How to Run Migrations

```bash
# Apply all pending migrations
make migrate

# Roll back one migration
alembic downgrade -1

# Generate a new migration from ORM model changes
alembic revision --autogenerate -m "add workspace_memories table"
```

## Rules

- Migrations are **never run automatically on application startup** (see ADR 0009). They are an explicit `make migrate` step.
- Every migration must have a working `downgrade()` function.
- Test migrations by running: `upgrade head` → `downgrade base` → `upgrade head` in CI.
- Migrations are committed to version control — never edit a migration that has already been applied to production.
