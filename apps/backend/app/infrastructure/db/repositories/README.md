# apps/backend/app/infrastructure/db/repositories/

Concrete SQLAlchemy implementations of the repository ports defined in `domain/ports/`. Each repository provides CRUD and domain-specific queries for one aggregate.

## Files (to be created in Phase 5)

| File | Port Implemented | Domain |
|---|---|---|
| `base.py` | — | Generic `BaseRepository[T]` with typed CRUD |
| `user_repository.py` | `UserRepository` | User lookup by email, upsert |
| `workspace_repository.py` | `WorkspaceRepository` | Workspace CRUD, list by user |
| `chat_repository.py` | `ChatRepository` | Session CRUD, message append, history retrieval |
| `agent_repository.py` | `AgentRepository` | Task CRUD, step append, status update |
| `embedding_repository.py` | `VectorStore` (embeddings) | Upsert by content hash, HNSW cosine search |
| `memory_repository.py` | `VectorStore` (memories) | Upsert, semantic search, decay pruning |
| `auth_repository.py` | — | Refresh token hash store, reuse detection |
| `audit_repository.py` | — | INSERT-only agent audit log |

## N+1 Prevention

Use `selectinload()` or `joinedload()` on all queries that fetch related models. Run `EXPLAIN ANALYZE` on any query that touches more than one table during development to verify index usage.
