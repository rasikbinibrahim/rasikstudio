# apps/backend/

The Rasik Studio backend service — a FastAPI application built with Clean Architecture.

## Responsibilities

- Serves the REST API (`/api/v1/*`) and WebSocket gateway (`/ws/*`)
- Runs AI inference via the Model Router (Ollama, Anthropic, OpenAI, Gemini)
- Executes agent tasks with the ReAct loop
- Manages RAG indexing and semantic search via pgvector
- Persists all state in PostgreSQL
- Uses Redis for caching, pub/sub event distribution, and background task queuing

## Architecture

```
Request → CORS → RequestLogger → Auth → RateLimiter → Router
                                        ↓
                              api/v1/* (transport layer)
                                        ↓
                              application/* (use cases)
                                        ↓
                        domain/* ←→ infrastructure/*
```

## Directory Map

| Directory | Layer | Purpose |
|---|---|---|
| `app/api/` | Transport | FastAPI routers and request/response schemas |
| `app/agents/` | Orchestration | Agent loop, tool registry, agent types |
| `app/application/` | Use Cases | Business workflows (one file = one use case) |
| `app/core/` | Cross-cutting | Config, logging, errors, security, middleware |
| `app/domain/` | Domain | Pure Python models, ports (interfaces), domain services |
| `app/infrastructure/` | Infrastructure | DB, cache, AI providers, browser, vector store |
| `alembic/` | Migrations | Database schema version management |
| `config/` | Configuration | YAML config files (non-secret) |
| `scripts/` | Operations | One-off admin and maintenance scripts |
| `tests/` | Testing | Unit and integration test suites |

## Tech Stack

Python 3.12+, FastAPI, SQLAlchemy 2.0 (async), asyncpg, Alembic, Redis (asyncio), pgvector, PyJWT, bcrypt, Playwright, structlog, ruff, mypy
