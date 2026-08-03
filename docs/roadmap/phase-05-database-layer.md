# Phase 5 — Database Layer

**Part of:** [Implementation Roadmap](README.md)
**Depends on:** Phase 4
**Estimated effort:** 1 week

---

## Objective

Implement the complete database schema with SQLAlchemy ORM models, Alembic migrations, and the pgvector extension. By the end of this phase, all tables exist in the database, all migrations are written (not just the models), and the ORM can perform CRUD on all entities.

## Architecture

**Schema (per `DATABASE_DESIGN.md`, with `agent_task_steps` normalized per ADR 0009):**

```
users                     ← user accounts
workspaces                ← open projects (FK: users)
workspace_api_keys        ← encrypted AI provider keys (FK: workspaces)
chat_sessions             ← conversation sessions (FK: workspaces)
messages                  ← chat messages (FK: chat_sessions)
agent_tasks               ← agent task records (FK: workspaces, WITHOUT steps JSONB)
agent_task_steps          ← normalized steps (FK: agent_tasks)
code_embeddings           ← pgvector embeddings (FK: workspaces)
workspace_memories        ← long-term agent memory (FK: workspaces)
refresh_tokens            ← hashed refresh tokens (FK: users)
```

**Key constraints:**
- `agent_task_steps` replaces the `steps JSONB` column in `agent_tasks` (see ADR 0009)
- All `id` columns use `UUID` with server-side default
- `code_embeddings.embedding` column uses `VECTOR(768)` with HNSW index
- `workspace_memories.embedding` uses `VECTOR(768)` with HNSW index
- Both HNSW indexes use `cosine` distance operator

**Migration strategy:**
- One migration per logical change
- Migrations are an explicit `make migrate` step, never automatic on startup
- `alembic upgrade head` is protected against concurrent execution via `pg_advisory_xact_lock`
- Migration files are committed to version control

**Connection pool:**
- `pool_size=10`, `max_overflow=20`
- `pool_pre_ping=True` (validate connections before use)
- `pool_recycle=3600` (recycle connections hourly)

## Dependencies

- Phase 4 complete (backend foundation, DB session configured)
- `pgvector` Python package
- `asyncpg`
- PostgreSQL 16 with pgvector extension running via Docker Compose
- `alembic`

## Files to Create

**SQLAlchemy ORM models:**
- `app/infrastructure/db/models/base.py` — `Base`, `TimestampMixin` (created_at, updated_at)
- `app/infrastructure/db/models/user.py` — `UserModel`
- `app/infrastructure/db/models/workspace.py` — `WorkspaceModel`, `WorkspaceApiKeyModel`
- `app/infrastructure/db/models/chat.py` — `ChatSessionModel`, `MessageModel`
- `app/infrastructure/db/models/agent.py` — `AgentTaskModel`, `AgentTaskStepModel`
- `app/infrastructure/db/models/embedding.py` — `CodeEmbeddingModel`, `WorkspaceMemoryModel`
- `app/infrastructure/db/models/auth.py` — `RefreshTokenModel`
- `app/infrastructure/db/models/__init__.py` — export all models (required by Alembic)

**Repositories:**
- `app/infrastructure/db/repositories/base.py` — generic `BaseRepository[T]` with CRUD
- `app/infrastructure/db/repositories/user_repository.py`
- `app/infrastructure/db/repositories/workspace_repository.py`
- `app/infrastructure/db/repositories/chat_repository.py`
- `app/infrastructure/db/repositories/agent_repository.py`
- `app/infrastructure/db/repositories/embedding_repository.py`
- `app/infrastructure/db/repositories/memory_repository.py`

**Alembic migrations:**
- `alembic/versions/0001_initial_schema.py` — all tables, all indexes, pgvector extension

**Scripts:**
- `scripts/check_migration_lock.py` — advisory lock wrapper for CI

## Files to Modify

- `app/infrastructure/db/session.py` — finalize engine creation with pool settings
- `app/core/events.py` — connect pool on startup, dispose on shutdown

## Acceptance Criteria

- [ ] `make migrate` runs `alembic upgrade head` successfully on a fresh database
- [ ] `make migrate` run twice is idempotent (second run makes no changes)
- [ ] `alembic downgrade -1` correctly reverses the initial migration
- [ ] All 10 tables exist in the database with correct column types
- [ ] `code_embeddings.embedding` column is `VECTOR(768)` type
- [ ] HNSW index exists on both `code_embeddings` and `workspace_memories`
- [ ] `agent_task_steps` table has correct FK to `agent_tasks` with `ON DELETE CASCADE`
- [ ] `pgvector` extension is enabled: `SELECT * FROM pg_extension WHERE extname = 'vector'` returns a row
- [ ] All repositories pass unit tests with real `testcontainers` PostgreSQL (no mocking)
- [ ] `mypy app/infrastructure/db/` passes with zero errors
- [ ] A `EXPLAIN` on `SELECT * FROM code_embeddings ORDER BY embedding <=> $1 LIMIT 10` shows an HNSW index scan

## Testing Strategy

- **Unit tests:** Repository methods tested against `testcontainers` PostgreSQL (not mocked)
- **Migration test:** Automated test that runs `upgrade head` → `downgrade base` → `upgrade head` on each migration (run in CI)
- No in-memory SQLite — the ORM must be tested against real PostgreSQL with pgvector

## Estimated Effort

**1 week**
- Day 1–2: All ORM models, base repository, migration
- Day 3: All feature repositories
- Day 4: Integration tests for all repositories
- Day 5: Migration CI test, polish, code review
