# Phase 4 — Backend Foundation

**Part of:** [Implementation Roadmap](README.md)
**Depends on:** Phase 2
**Estimated effort:** 3 weeks

---

## Objective

Build the FastAPI backend using Clean Architecture: app factory, all 4 layers, middleware stack, dependency injection, health checks, error hierarchy, and structured logging. By the end of this phase, the backend starts, responds to requests, and provides a foundation for every subsequent feature. No business logic yet — only the application skeleton.

## Architecture

**Layer separation:**
```
api/          ← FastAPI routers, request/response schemas, no business logic
application/  ← use cases, orchestrate domain services and infrastructure
domain/       ← pure Python models, ports (interfaces), domain services
infrastructure/ ← implementations of ports: DB, cache, AI providers, tools
core/         ← cross-cutting concerns: config, security, logging, errors, middleware
agents/       ← agent orchestration (complex enough for its own top-level module)
```

**App factory (`create_app()`):**
```
Request → CORS → RequestLogger → Auth → RateLimiter → Router
         ↑ middleware stack, applied in this order
```

**Dependency injection:**
- All service dependencies injected via `Depends()`
- Database session: `AsyncSession` via `get_db()` dependency
- Redis client: via `get_redis()` dependency
- Current user: via `get_current_user()` dependency (Phase 6)

**Structured logging** (structlog + contextvars):
- Every request gets a `request_id` (UUID, set in middleware)
- Logs include: `request_id`, `user_id`, `workspace_id`, `method`, `path`, `status`, `duration_ms`
- JSON format in production, human-readable in development

**Error hierarchy:**
```
RasikStudioError (base)
├── AuthError (401/403)
├── WorkspaceError (404/409)
├── AIError (502/503)
├── StorageError (500)
└── ValidationError (422)
```

Each error has a `code` (string slug), `message` (human-readable), and maps to an HTTP status code.

## Dependencies

- Phase 2 complete (backend skeleton)
- `fastapi[standard]`, `uvicorn[standard]`
- `sqlalchemy[asyncio]`, `asyncpg`
- `alembic`
- `redis[asyncio]`
- `celery[redis]`
- `pydantic-settings`
- `structlog`
- `aiofiles`
- `PyJWT[cryptography]`
- `slowapi`
- `httpx`

## Files to Create

**Core:**
- `app/core/config.py` — `Settings` class (pydantic-settings, all env vars)
- `app/core/logging.py` — structlog configuration, `RequestIDMiddleware`
- `app/core/errors.py` — error hierarchy, exception handlers
- `app/core/middleware/` — `cors.py`, `request_logger.py`, `auth.py`, `rate_limiter.py`
- `app/core/events.py` — `startup()` and `shutdown()` lifecycle hooks
- `app/core/dependencies.py` — `get_db()`, `get_redis()`, `get_settings()`

**App factory:**
- `app/main.py` — `create_app()` factory, mount routers, register exception handlers

**Domain:**
- `app/domain/models/user.py`
- `app/domain/models/workspace.py`
- `app/domain/models/chat.py`
- `app/domain/models/agent.py`
- `app/domain/ports/ai_provider.py` — abstract `AIProvider` interface
- `app/domain/ports/vector_store.py` — abstract `VectorStore` interface
- `app/domain/ports/cache.py` — abstract `Cache` interface

**Infrastructure (stubs — implemented in later phases):**
- `app/infrastructure/db/session.py` — async SQLAlchemy engine + session factory
- `app/infrastructure/cache/redis_client.py` — Redis connection pool
- `app/infrastructure/ai/__init__.py`

**API:**
- `app/api/v1/__init__.py` — master router that includes all sub-routers
- `app/api/v1/health.py` — `GET /health/live`, `GET /health/ready`

**Scripts:**
- `scripts/create_superuser.py` — CLI script to bootstrap first admin user

## Files to Modify

- `alembic/env.py` — configure async SQLAlchemy connection for migrations
- `apps/backend/.env.example` — ensure all keys from `DEPLOYMENT_GUIDE.md §4` are present

## Acceptance Criteria

- [ ] `uvicorn app.main:app --reload` starts with no errors
- [ ] `GET /health/live` returns `{"status": "ok"}` with HTTP 200
- [ ] `GET /health/ready` returns database and Redis connectivity status
- [ ] Requesting a non-existent endpoint returns the standard error schema: `{"error": {"code": "...", "message": "...", "request_id": "..."}}`
- [ ] Every request has a `request_id` in both the response header and the structured log line
- [ ] Request log line contains: `request_id`, `method`, `path`, `status_code`, `duration_ms`
- [ ] A deliberate `raise AIError("test")` in a route returns HTTP 502 with correct error schema
- [ ] `mypy app/` passes with zero errors
- [ ] `ruff check app/` passes with zero errors
- [ ] `CORS_ORIGINS` setting correctly rejects a cross-origin request from an unlisted origin
- [ ] Rate limiter correctly returns HTTP 429 after exceeding the configured limit
- [ ] No secrets appear in any log line (confirm by checking structlog output with a real API key in env)

## Testing Strategy

- **Unit tests (pytest):** `Settings` parsing (valid + missing required keys), error hierarchy serialization, all middleware behavior
- **Integration tests (pytest + httpx AsyncClient):** Health endpoints, CORS behavior, error response shape
- No mocking of infrastructure in integration tests — use `testcontainers` for real PostgreSQL and Redis

## Estimated Effort

**3 weeks**
- Week 1: Core config, logging, error hierarchy, middleware, app factory
- Week 2: Domain models, ports, infrastructure stubs, alembic env, DB session
- Week 3: Health endpoints, dependency injection wiring, tests, CI integration
