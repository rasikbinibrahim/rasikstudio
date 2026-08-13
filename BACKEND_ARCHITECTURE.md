# Backend Architecture — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03

---

## 1. Overview

The backend is a FastAPI application built with Clean Architecture principles. It serves as the intelligence layer between the Electron frontend and all AI, storage, and external service integrations. It exposes REST endpoints and a WebSocket gateway, runs background agent tasks via Celery, and persists state in PostgreSQL and Redis.

---

## 2. Guiding Principles

- **Clean Architecture** — UI, application, domain, and infrastructure layers are strictly separated.
- **Dependency Injection** — all services are injected via FastAPI's `Depends()` system.
- **Async-first** — every I/O operation uses `async/await` (asyncpg, httpx, aioredis).
- **Type safety** — Pydantic v2 for all request/response schemas; mypy strict mode.
- **Testability** — services are pure classes with no global state; easily mockable.

---

## 3. Layer Structure

The full, authoritative `apps/backend/app/` tree lives in `FOLDER_STRUCTURE.md`; the module-by-module breakdown (every file, its class, and its responsibility) is in `PROJECT_STRUCTURE.md §3`. In summary:

```
api/ (transport)  →  application/ (use cases)  →  domain/ (models, ports, services) ←──┐
agents/ (orchestration, its own top-level module)  ─────────────────────────────────────┤
                                                              infrastructure/ (implements domain ports) ┘
core/ (config, security, logging, errors, events, dependencies, middleware — imports nothing else)
```

Note: the agent tool implementations live under `app/agents/tools/`, not `app/infrastructure/tools/` — the agent orchestration module is deliberately kept outside the four Clean Architecture layers (see `app/README.md`) because it spans domain, application, and infrastructure concerns.

---

## 4. Application Factory

```python
# app/main.py
def create_app() -> FastAPI:
    app = FastAPI(title="Rasik Studio API", version="1.0.0")
    register_middleware(app)
    register_routers(app)
    register_exception_handlers(app)
    register_lifespan(app)
    return app
```

Lifespan events:
- **startup:** Initialize DB pool, Redis connection, Ollama health check, load tool registry.
- **shutdown:** Gracefully close pools and cancel in-flight agent tasks.

---

## 5. Dependency Injection

FastAPI's `Depends()` wires the dependency graph at request time:

```python
# Typical endpoint
@router.post("/chat/sessions/{session_id}/messages")
async def send_message(
    session_id: UUID,
    body: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    chat_service: ChatService = Depends(get_chat_service),
):
    async for chunk in chat_service.stream(session_id, body.content, current_user):
        yield chunk
```

Provider graph:
```
get_db_session → AsyncSession
get_redis → Redis
get_chat_repository(db) → ChatRepository
get_model_router(settings) → ModelRouter
get_chat_service(repo, router) → ChatService
```

---

## 6. WebSocket Gateway

The WebSocket gateway is the real-time backbone:

```
Client connects: WS /ws/{workspace_id}
    ├── Auth validated (first-message JWT — see ADR 0005)
    ├── Connection registered in ConnectionManager
    │       (keyed by (workspace_id, user_id) → WebSocket connection)
    └── Subscribed to two Redis pub/sub channels:
            ws:workspace:{workspace_id}:user:{user_id}   ← events scoped to this user only
            ws:workspace:{workspace_id}:shared           ← events broadcast to everyone in the workspace

Backend service publishes an event to Redis:
    redis.publish("ws:workspace:abc123:user:xyz", json.dumps(event))   # e.g. this user's approval prompt
    redis.publish("ws:workspace:abc123:shared", json.dumps(event))     # e.g. a file changed on disk

Gateway receives from Redis, delivers to the WS connection(s) subscribed to that channel.
```

Per-user channels let events like `agent_approval_required` reach only the user who needs to act on them, while shared channels broadcast workspace-wide events (file changes, RAG index progress) to every connected client. See `apps/backend/app/api/ws/README.md` for the full routing convention.

Event types emitted over WebSocket:

| Event | Payload |
|---|---|
| `stream_chunk` | `{message_id, delta}` |
| `stream_end` | `{message_id, finish_reason, usage}` |
| `agent_started` | `{task_id, description}` |
| `agent_step` | `{task_id, step_index, tool, args, result}` |
| `agent_approval_required` | `{task_id, action, preview}` |
| `agent_question_asked` | `{task_id, question}` — the `ask_followup_question` tool's own pause, distinct from `agent_approval_required` (see `AGENT_FRAMEWORK.md` §4); answered via `POST /agents/tasks/{id}/answer` |
| `agent_status_changed` | `{task_id, status}` |
| `agent_completed` | `{task_id, summary}` |
| `agent_failed` | `{task_id, error}` |
| `file_changed` | `{path, change}` — shared channel |
| `git_status_changed` | `{branch}` — shared channel |
| `index_progress` | `{workspace_id, files_done, files_total}` — shared channel; `files_done == files_total` is completion (no separate "workspace_indexed" event, to avoid the two drifting out of sync) |

Canonical Pydantic definitions: `app/api/ws/event_types.py`'s `ServerEvent` discriminated union.

---

## 7. Background Tasks

Long-running operations (agent execution, workspace indexing) run in Celery workers:

```
FastAPI → enqueue task → Redis (broker) → Celery worker → publish events → Redis pub/sub → WebSocket → Frontend
```

Celery configuration:
- Broker: Redis
- Result backend: Redis
- Worker concurrency: 4 (configurable)
- Task timeout: 300s (configurable per task type)
- Retry policy: 3 retries with exponential backoff

---

## 8. Error Hierarchy

```
RasikStudioError (base)
├── AuthError
│   ├── InvalidCredentialsError
│   └── TokenExpiredError
├── WorkspaceError
│   ├── WorkspaceNotFoundError
│   └── WorkspaceAccessDeniedError
├── AIError
│   ├── ModelUnavailableError
│   ├── ContextWindowExceededError
│   └── ToolExecutionError
└── StorageError
    ├── FileNotFoundError
    └── FileWriteError
```

All exceptions map to HTTP status codes via a global exception handler.

---

## 9. Request Lifecycle

```
HTTP Request
    → CORS Middleware
    → Request Logger (structlog: method, path, request_id)
    → Auth Middleware (validate JWT → inject user)
    → Rate Limiter (slowapi: per-user limits)
    → Router → Handler
    → Application Service
    → Domain Service / Repository
    → Infrastructure (DB / AI / Cache)
    ← Response
    → Response Logger (status, latency)
```

---

## 10. Configuration Management

All config is loaded from environment variables via pydantic-settings:

```python
class Settings(BaseSettings):
    # App
    APP_ENV: Literal["development", "staging", "production"] = "development"
    SECRET_KEY: str
    
    # Database
    DATABASE_URL: str  # asyncpg DSN
    
    # Redis
    REDIS_URL: str
    
    # AI
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    
    # Auth
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
```

---

## 11. Logging

Using structlog with JSON output in production:

```python
log.info("message_sent", 
    session_id=str(session_id),
    model=model_name,
    token_count=usage.total_tokens,
    latency_ms=elapsed)
```

Log levels:
- `DEBUG` — development only
- `INFO` — normal operations
- `WARNING` — degraded conditions (fallback triggered, retries)
- `ERROR` — operation failed, user-impacting
- `CRITICAL` — system-level failures (DB unreachable, etc.)

---

## 12. Health Checks

```
GET /health         → 200 OK (always, for load balancer)
GET /health/ready   → 200 OK only when DB + Redis are reachable
GET /health/live    → 200 OK if process is running
```

---

## 13. API Versioning

All routes are prefixed `/api/v1/`. Breaking changes introduce `/api/v2/` without removing v1 until clients migrate.

---

## 14. Testing

- Unit tests: `pytest` + `pytest-asyncio` for all services (no DB/network).
- Integration tests: `httpx.AsyncClient` + real DB in Docker.
- Coverage target: 85%.
- See `TESTING_STRATEGY.md`.
