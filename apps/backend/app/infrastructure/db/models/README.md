# apps/backend/app/infrastructure/db/models/

SQLAlchemy ORM model definitions. These map Python classes to database tables. They are infrastructure — not domain models. Domain models (in `domain/models/`) are pure Python dataclasses.

## Files (to be created in Phase 5)

| File | Tables |
|---|---|
| `base.py` | `Base` (declarative base), `TimestampMixin` (created_at, updated_at) |
| `user.py` | `UserModel` — maps to `users` table |
| `workspace.py` | `WorkspaceModel`, `WorkspaceApiKeyModel` |
| `chat.py` | `ChatSessionModel`, `MessageModel` |
| `agent.py` | `AgentTaskModel`, `AgentTaskStepModel` (normalized — no steps JSONB) |
| `embedding.py` | `CodeEmbeddingModel`, `WorkspaceMemoryModel` (pgvector VECTOR columns) |
| `auth.py` | `RefreshTokenModel` |
| `audit.py` | `AgentAuditLogModel` (INSERT-only audit table) |
| `__init__.py` | Imports all models — required by Alembic autogenerate |

## Mapping Convention

Each ORM model has a `to_domain()` method that returns the corresponding domain dataclass. This keeps the ORM concern isolated in the infrastructure layer.

## pgvector

`CodeEmbeddingModel.embedding` and `WorkspaceMemoryModel.embedding` use `Vector(768)` from the `pgvector.sqlalchemy` extension. HNSW indexes are created in the Alembic migration, not via ORM metadata.
