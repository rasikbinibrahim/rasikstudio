# docs/adr/

Architecture Decision Records. One file per major decision. ADRs are never deleted — superseded decisions are updated with a "Superseded by ADR-XXXX" status.

## Files (real, written in Phase 17 — 2026-08-11; all 10 have a real, verified "Outcome" section)

| File | Decision | Outcome, in short |
|---|---|---|
| `0001-desktop-framework-electron-vs-tauri.md` | Electron over Tauri | Confirmed correct |
| `0002-backend-framework-fastapi.md` | FastAPI over Django, Flask, or other alternatives | Confirmed correct |
| `0003-database-postgresql-pgvector.md` | PostgreSQL + pgvector over Chroma, Pinecone, or other vector DBs | Confirmed correct; no workspace has been indexed yet, a separate real gap |
| `0004-background-tasks-arq-vs-celery.md` | Celery chosen over arq | Implemented for agent task execution (a real broker/worker — see `app/core/celery_app.py`, `app/tasks/agent_tasks.py`); chat message streaming deliberately still uses `asyncio.create_task()` — see the ADR's own Outcome |
| `0005-websocket-auth-first-message.md` | First-message JWT auth vs. query-parameter (security) | Confirmed correct and implemented |
| `0006-streaming-architecture-unified-websocket.md` | All streaming unified on WebSocket, not SSE + WebSocket hybrid | Confirmed correct |
| `0007-type-sharing-openapi-generated.md` | OpenAPI-generated TypeScript types vs. manual shared-types package | Generated for real in Phase 17; not yet consumed by the desktop app's existing hand-written types |
| `0008-git-implementation-cli-subprocess.md` | Git CLI subprocess vs. libgit2 native binding | Confirmed correct |
| `0009-agent-steps-normalized-table.md` | Separate `agent_task_steps` table vs. JSONB array in `agent_tasks` | Confirmed correct |
| `0010-embedding-model-nomic-768d.md` | nomic-embed-text (768d) as primary embedding model | Confirmed correct; not yet exercised end-to-end (no workspace indexed) |

## ADR Format

Each ADR contains: **Status**, **Context** (the problem), **Decision** (what was chosen), **Rationale** (why), **Alternatives Considered**, **Consequences**, and **Outcome** (filled after implementation).
