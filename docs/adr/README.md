# docs/adr/

Architecture Decision Records. One file per major decision. ADRs are never deleted — superseded decisions are updated with a "Superseded by ADR-XXXX" status.

## Files (to be created in Phase 1)

| File | Decision |
|---|---|
| `0001-desktop-framework-electron-vs-tauri.md` | Why Electron was chosen (or Tauri, pending evaluation) |
| `0002-backend-framework-fastapi.md` | FastAPI over Django, Flask, or other alternatives |
| `0003-database-postgresql-pgvector.md` | PostgreSQL + pgvector over Chroma, Pinecone, or other vector DBs |
| `0004-background-tasks-arq-vs-celery.md` | Celery chosen over arq — mature ecosystem, built-in retries/rate-limiting/beat scheduling needed for agent tasks and RAG indexing |
| `0005-websocket-auth-first-message.md` | First-message JWT auth vs. query-parameter (security) |
| `0006-streaming-architecture-unified-websocket.md` | All streaming unified on WebSocket, not SSE + WebSocket hybrid |
| `0007-type-sharing-openapi-generated.md` | OpenAPI-generated TypeScript types vs. manual shared-types package |
| `0008-git-implementation-cli-subprocess.md` | Git CLI subprocess vs. libgit2 native binding |
| `0009-agent-steps-normalized-table.md` | Separate `agent_task_steps` table vs. JSONB array in `agent_tasks` |
| `0010-embedding-model-nomic-768d.md` | nomic-embed-text (768d) as primary embedding model |

## ADR Format

Each ADR contains: **Status**, **Context** (the problem), **Decision** (what was chosen), **Rationale** (why), **Alternatives Considered**, **Consequences**, and **Outcome** (filled after implementation).
