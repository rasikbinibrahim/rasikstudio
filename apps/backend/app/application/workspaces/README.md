# apps/backend/app/application/workspaces/

Workspace lifecycle use cases.

## Files — CRUD persistence (built)

| File | Use Case | Description |
|---|---|---|
| `create_workspace.py` | `CreateWorkspaceUseCase` | Register a new workspace in the DB — idempotent by `(user_id, root_path)`: opening an already-known folder bumps `last_opened_at` instead of creating a duplicate row |
| `list_workspaces.py` | `ListWorkspacesUseCase` | List a user's workspaces, most-recently-opened first |
| `get_workspace.py` | `GetWorkspaceUseCase` | Fetch one workspace, ownership-checked |
| `update_workspace.py` | `UpdateWorkspaceUseCase` | Rename / update `settings` |
| `delete_workspace.py` | `DeleteWorkspaceUseCase` | Delete a workspace and (via `ON DELETE CASCADE`) everything under it |
| `index_workspace.py` | `IndexWorkspaceUseCase` | Ownership-checks, then dispatches a real RAG indexing run to a Celery worker (ADR 0004) — `POST /workspaces/{id}/index`. The actual indexing (`infrastructure/rag/indexer.py`, `domain/services/chunker.py`) runs in the worker, not this use case; see `RAG_SYSTEM.md`'s implementation-status note for what's real vs. still-deferred within the pipeline itself (only fixed-size chunking, no file-watcher-triggered auto-reindex). Built 2026-08-11. |

## Files — lifecycle orchestration (deliberately not built yet)

These need infrastructure that doesn't exist in this repository yet — building them now would mean
either a fake/no-op implementation (against this project's own rules) or scope creep well past
"give the desktop app a workspace UUID to key a WebSocket connection on," which is what actually
motivated this pass:

| File | Use Case | Blocked on |
|---|---|---|
| `open_workspace.py` | `OpenWorkspaceUseCase` | File-watcher service (no `chokidar`-equivalent backend infra exists). No longer blocked on RAG indexing itself (real since 2026-08-11) — but nothing calls `index_workspace_task` automatically on open yet; a user (or the desktop app, once it has a trigger UI) must call `POST /workspaces/{id}/index` explicitly. |
| `close_workspace.py` | `CloseWorkspaceUseCase` | Same file-watcher dependency |
| `manage_settings.py` | `ManageWorkspaceSettingsUseCase` | The 4-layer settings hierarchy itself isn't designed anywhere yet beyond `Workspace.settings` being a plain JSONB blob |

`POST /workspaces/{id}/index` is real (see the CRUD table above). The `/workspaces/{id}/files/*`
endpoints from `API_SPECIFICATION.md` §3 remain deferred — they'd overlap with the desktop app's
own local Electron IPC file access, which already works and doesn't route through the backend at
all today, and that overlap deserves a deliberate design decision, not an accidental duplicate
implementation built here without one.
