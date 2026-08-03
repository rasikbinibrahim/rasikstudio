# apps/backend/app/application/workspaces/

Workspace lifecycle use cases.

## Files (to be created in Phase 4)

| File | Use Case | Description |
|---|---|---|
| `create_workspace.py` | `CreateWorkspaceUseCase` | Register a new workspace in the DB |
| `open_workspace.py` | `OpenWorkspaceUseCase` | Load settings, register file watcher, trigger RAG index check |
| `close_workspace.py` | `CloseWorkspaceUseCase` | Deregister file watcher, unsubscribe WebSocket channels |
| `index_workspace.py` | `IndexWorkspaceUseCase` | Enqueue all files for RAG indexing |
| `manage_settings.py` | `ManageWorkspaceSettingsUseCase` | Read and write the 4-layer settings hierarchy |
