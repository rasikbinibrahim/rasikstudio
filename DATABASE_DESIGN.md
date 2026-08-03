# Database Design — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03

---

## 1. Overview

Rasik Studio uses PostgreSQL 16 as the primary database with the `pgvector` extension for embedding storage. Redis serves as the cache, session store, Celery broker, and real-time pub/sub bus.

---

## 2. PostgreSQL Schema

### 2.1 users

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    avatar_url      TEXT,
    auth_provider   TEXT NOT NULL DEFAULT 'local',  -- 'local' | 'github' | 'google'
    hashed_password TEXT,                           -- null for OAuth users
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    settings        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users (email);
```

### 2.2 workspaces

```sql
CREATE TABLE workspaces (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    root_path       TEXT NOT NULL,             -- absolute path on user's machine
    settings        JSONB NOT NULL DEFAULT '{}',
    last_opened_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workspaces_user_id ON workspaces (user_id);
CREATE INDEX idx_workspaces_last_opened ON workspaces (user_id, last_opened_at DESC);
```

### 2.3 workspace_api_keys

```sql
CREATE TABLE workspace_api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider        TEXT NOT NULL,            -- 'openai' | 'anthropic' | 'gemini'
    encrypted_key   TEXT NOT NULL,            -- AES-256 encrypted
    key_hint        TEXT NOT NULL,            -- last 4 chars for display
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_api_keys_workspace_provider ON workspace_api_keys (workspace_id, provider);
```

### 2.4 chat_sessions

```sql
CREATE TABLE chat_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           TEXT NOT NULL DEFAULT 'New Chat',
    model           TEXT NOT NULL,            -- model identifier used in this session
    system_prompt   TEXT,                     -- custom system prompt override
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_sessions_workspace ON chat_sessions (workspace_id, created_at DESC);
CREATE INDEX idx_chat_sessions_user ON chat_sessions (user_id, created_at DESC);
```

### 2.5 messages

```sql
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content         TEXT,
    tool_calls      JSONB,                    -- [{id, name, arguments}]
    tool_call_id    TEXT,                     -- for role='tool' responses
    token_count     INTEGER,
    finish_reason   TEXT,                     -- 'stop' | 'tool_calls' | 'length' | 'error'
    model           TEXT,                     -- model that generated this message
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_session ON messages (session_id, created_at ASC);
```

### 2.6 agent_tasks

```sql
CREATE TABLE agent_tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    session_id      UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description     TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
    plan            JSONB,                    -- agent's decomposed plan
    steps           JSONB NOT NULL DEFAULT '[]',  -- [{index, tool, args, result, status, started_at, finished_at}]
    result          TEXT,
    error           TEXT,
    model           TEXT,
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_tasks_workspace ON agent_tasks (workspace_id, created_at DESC);
CREATE INDEX idx_agent_tasks_status ON agent_tasks (status) WHERE status IN ('pending', 'running', 'paused');
```

### 2.7 code_embeddings

```sql
-- Requires pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE code_embeddings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    file_path       TEXT NOT NULL,            -- relative to workspace root
    chunk_index     INTEGER NOT NULL,
    content         TEXT NOT NULL,
    embedding       VECTOR(768),              -- nomic-embed-text dimension
    language        TEXT,
    start_line      INTEGER,
    end_line        INTEGER,
    content_hash    TEXT NOT NULL,            -- SHA-256 of content for incremental updates
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE (workspace_id, file_path, chunk_index)
);

-- HNSW index for fast approximate nearest-neighbor search
CREATE INDEX idx_embeddings_vector ON code_embeddings 
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_embeddings_workspace_file ON code_embeddings (workspace_id, file_path);
```

### 2.8 refresh_tokens

```sql
CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,     -- SHA-256 hash of the token
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id, expires_at);
-- Cleanup old tokens: DELETE FROM refresh_tokens WHERE expires_at < now() - INTERVAL '1 day';
```

---

## 3. Entity Relationships

```
users
  └── workspaces (1:N)
        ├── workspace_api_keys (1:N)
        ├── chat_sessions (1:N)
        │     └── messages (1:N)
        ├── agent_tasks (1:N)
        └── code_embeddings (1:N)

users
  └── refresh_tokens (1:N)
```

---

## 4. Alembic Migration Strategy

```
apps/backend/
└── alembic/
    ├── env.py          # async migration environment
    ├── script.py.mako
    └── versions/
        ├── 0001_initial_schema.py
        ├── 0002_add_pgvector.py
        └── 0003_add_agent_tasks.py
```

Rules:
- Every schema change = a new migration file.
- Never edit a migration that has been applied to any environment.
- `alembic upgrade head` runs on application startup in non-production.
- Production migrations are run as a separate deployment step.

---

## 5. SQLAlchemy ORM Models

SQLAlchemy models live in `app/infrastructure/db/models/` and mirror the schema above. They use the `DeclarativeBase` with `Mapped` type annotations (SQLAlchemy 2.0 style):

```python
class Message(Base):
    __tablename__ = "messages"
    
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    session_id: Mapped[UUID] = mapped_column(ForeignKey("chat_sessions.id", ondelete="CASCADE"))
    role: Mapped[str]
    content: Mapped[str | None]
    tool_calls: Mapped[dict | None] = mapped_column(JSONB)
    token_count: Mapped[int | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    
    session: Mapped["ChatSession"] = relationship(back_populates="messages")
```

---

## 6. Redis Data Structures

| Key Pattern | Type | TTL | Purpose |
|---|---|---|---|
| `session:{user_id}:{token_id}` | String (JSON) | 30m | JWT session metadata |
| `ws:connections:{workspace_id}` | Set | — | Active WS connection IDs |
| `ws:workspace:{workspace_id}:user:{user_id}` | Pub/Sub channel | — | Events scoped to one user (e.g. their own approval prompts) |
| `ws:workspace:{workspace_id}:shared` | Pub/Sub channel | — | Events broadcast to every client connected to the workspace |
| `agent:task:{task_id}:lock` | String | 5m | Distributed lock (prevent duplicate execution) |
| `rate_limit:{user_id}:{endpoint}` | Counter | 60s | API rate limiting |
| `model:cache:{hash}` | String (JSON) | 1h | Cached non-streaming AI responses |
| `index:progress:{workspace_id}` | String (JSON) | 10m | RAG indexing progress |

This table is the canonical Redis key reference for the whole backend — see `apps/backend/app/infrastructure/cache/README.md` for the cache-service-specific usage notes, and `apps/backend/app/api/ws/README.md` for the WebSocket auth/routing protocol built on the two pub/sub channels above.

---

## 7. Connection Pooling

PostgreSQL connection pool (asyncpg via SQLAlchemy):
```python
engine = create_async_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True,
)
```

Redis connection pool (aioredis):
```python
redis = await aioredis.from_url(
    REDIS_URL,
    max_connections=50,
    decode_responses=True,
)
```

---

## 8. Data Retention

| Table | Retention Policy |
|---|---|
| `messages` | 90 days by default; user can purge manually |
| `agent_tasks` | 30 days after `finished_at` |
| `code_embeddings` | Deleted when workspace is deleted or file is removed |
| `refresh_tokens` | Deleted on expiry or explicit revocation |
| Redis keys | Per-key TTL as defined above |

A scheduled Celery task runs nightly to purge expired records.

---

## 9. Backup Strategy

- **Development:** Docker volume; no automated backup.
- **Production:** Daily `pg_dump` compressed to S3/R2 with 30-day retention; Redis persistence via AOF.
- **Point-in-time recovery:** PostgreSQL WAL archiving in production.

---

## 10. Performance Notes

- HNSW index on `code_embeddings.embedding` keeps ANN search under 100ms for 1M vectors.
- All foreign keys have explicit indexes to prevent sequential scans on JOIN.
- JSONB columns (`tool_calls`, `steps`, `settings`) avoid schema migrations for evolving structures while remaining queryable.
- `pg_trgm` extension can be added for fast full-text search on `messages.content` and `code_embeddings.content`.
