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

## Files — lifecycle orchestration (deliberately not built yet)

These need infrastructure that doesn't exist in this repository yet — building them now would mean
either a fake/no-op implementation (against this project's own rules) or scope creep well past
"give the desktop app a workspace UUID to key a WebSocket connection on," which is what actually
motivated this pass:

| File | Use Case | Blocked on |
|---|---|---|
| `open_workspace.py` | `OpenWorkspaceUseCase` | File-watcher service (no `chokidar`-equivalent backend infra exists) and RAG indexing (Phase 10/9) |
| `close_workspace.py` | `CloseWorkspaceUseCase` | Same file-watcher dependency |
| `index_workspace.py` | `IndexWorkspaceUseCase` | Celery (ADR 0004 chose it, nothing built yet) + RAG embedding pipeline (Phase 10) |
| `manage_settings.py` | `ManageWorkspaceSettingsUseCase` | The 4-layer settings hierarchy itself isn't designed anywhere yet beyond `Workspace.settings` being a plain JSONB blob |

`POST /workspaces/{id}/index` and the `/workspaces/{id}/files/*` endpoints from
`API_SPECIFICATION.md` §§2–3 are deferred for the same reasons (indexing needs the use case above;
files overlaps with the desktop app's own local Electron IPC file access, which already works and
doesn't route through the backend at all today — worth a deliberate design decision, not an
accidental duplicate implementation, before building a second one here).
