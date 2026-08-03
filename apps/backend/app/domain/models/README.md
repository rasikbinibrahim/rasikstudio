# apps/backend/app/domain/models/

Pure Python dataclasses representing business entities. No SQLAlchemy, no Pydantic, no external dependencies.

## Files (to be created in Phase 4)

| File | Entities |
|---|---|
| `user.py` | `User(id, email, hashed_password, settings, created_at)` |
| `workspace.py` | `Workspace(id, user_id, name, root_path, settings, created_at)` |
| `chat.py` | `ChatSession(...)`, `Message(id, session_id, role, content, tool_calls, token_count)` |
| `agent.py` | `AgentTask(id, workspace_id, type, status, goal, plan, created_at)`, `AgentStep(...)` |
| `embedding.py` | `CodeEmbedding(id, workspace_id, file_path, chunk_index, content, embedding, ...)` |
| `memory.py` | `WorkspaceMemory(id, workspace_id, type, content, embedding, access_count, ...)` |

## Rules

- Use `@dataclass` or `@dataclass(frozen=True)` — not Pydantic, not SQLAlchemy.
- No default factory that depends on external state.
- IDs are `UUID` — generated at the application level, not the database level.
- These classes must be importable with zero side effects.
