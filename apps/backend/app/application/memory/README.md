# apps/backend/app/application/memory/

Long-term memory extraction and retrieval use cases. Memory is how the AI accumulates knowledge about a workspace across sessions.

## Files (to be created in Phase 10)

| File | Use Case | Description |
|---|---|---|
| `extract_memories.py` | `ExtractMemoriesUseCase` | Post-session LLM call to classify and store facts from the conversation |
| `retrieve_memories.py` | `RetrieveMemoriesUseCase` | Semantic search over `workspace_memories` table for relevant context |
| `prune_memories.py` | `PruneMemoriesUseCase` | Delete memories older than 180 days with low access count (weekly task) |

## Memory Types

Facts extracted from sessions are classified into: `architecture`, `convention`, `bug`, `dependency`, `location`, `environment`. Each is stored as a vector embedding in `workspace_memories` for semantic retrieval.

## Privacy

Memories are workspace-scoped. They are never shared across workspaces unless `workspace_id = NULL` (global user memories). Memories are never sent to cloud AI providers without user awareness.
