# Memory System — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03

---

## 1. Overview

The Memory System gives AI agents and chat sessions persistent knowledge that survives across conversations. It operates at two levels:

1. **Short-term (working memory):** The agent's current context window — ephemeral, managed per task.
2. **Long-term (semantic memory):** Key facts, decisions, and summaries stored as vector embeddings and retrieved on demand.

---

## 2. Memory Types

| Type | Scope | Storage | TTL |
|---|---|---|---|
| Working memory | Per task/session | In-memory (context window) | Until task ends |
| Conversation memory | Per chat session | PostgreSQL (messages table) | 90 days |
| Agent memory | Per workspace | pgvector | Indefinite |
| Workspace facts | Per workspace | pgvector | Until invalidated |
| User preferences | Per user | PostgreSQL (settings JSONB) | Indefinite |

---

## 3. Short-Term (Working) Memory

The agent's working memory is the messages list passed to the model. It includes:

```
[
  SystemMessage("You are a coder agent..."),
  SystemMessage("## Workspace Memory\n{retrieved_long_term_memories}"),
  HumanMessage("Add unit tests for the auth module"),
  AssistantMessage("Let me start by reading the auth module..."),
  AssistantMessage(tool_call=read_file("/src/auth.ts")),
  ToolMessage(result="...file content..."),
  AssistantMessage("Now I'll write the tests..."),
  ...
]
```

When the working memory approaches the context window limit, the oldest tool result messages are summarized and compressed:

```python
async def compress_working_memory(messages: list[Message], model: str) -> list[Message]:
    """
    Summarize old tool results to free context space.
    Preserves: system messages, the user's original task, last 5 exchanges.
    Compresses: older assistant/tool exchanges into a summary.
    """
    if count_tokens(messages, model) < CONTEXT_WINDOW[model] * 0.8:
        return messages
    
    # Keep first 2 (system) + last 10 messages
    head = messages[:2]
    tail = messages[-10:]
    middle = messages[2:-10]
    
    summary_prompt = f"Summarize the following agent steps concisely:\n\n{format_messages(middle)}"
    summary = await model_router.complete([Message("user", summary_prompt)], model)
    
    return head + [Message("system", f"## Summary of prior steps\n{summary.content}")] + tail
```

---

## 4. Long-Term (Semantic) Memory

After a task or conversation completes, an extraction step identifies and stores key facts.

### 4.1 Memory Extraction

```python
EXTRACTION_PROMPT = """
Review this conversation/task and extract facts that would be useful to remember for future interactions in this workspace.

Focus on:
- Architecture decisions and their rationale
- Project conventions (naming, patterns, testing approach)
- Known bugs or limitations
- Dependencies and their versions
- Important file locations
- Environment-specific details

Return a JSON array of memory objects:
[
  {"content": "...", "type": "architecture|convention|bug|dependency|location|environment"},
  ...
]

Return an empty array if nothing worth remembering was discussed.
"""

async def extract_memories(
    session_content: str,
    model: str,
) -> list[MemoryItem]:
    result = await model_router.complete(
        messages=[
            Message("system", EXTRACTION_PROMPT),
            Message("user", session_content),
        ],
        model=model,
        response_format={"type": "json_object"},
    )
    return [MemoryItem(**item) for item in json.loads(result.content)]
```

### 4.2 Memory Storage

```python
@dataclass
class MemoryItem:
    id: UUID
    workspace_id: UUID
    content: str
    memory_type: str      # 'architecture' | 'convention' | 'bug' | ...
    source: str           # 'chat' | 'agent' | 'manual'
    source_id: UUID       # session_id or task_id
    embedding: list[float]
    created_at: datetime
    last_accessed_at: datetime
    access_count: int
```

Stored in a `workspace_memories` table (similar structure to `code_embeddings`):

```sql
CREATE TABLE workspace_memories (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    content           TEXT NOT NULL,
    memory_type       TEXT NOT NULL,
    source            TEXT NOT NULL,
    source_id         UUID,
    embedding         VECTOR(768),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_accessed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    access_count      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_memories_workspace ON workspace_memories (workspace_id);
CREATE INDEX idx_memories_vector ON workspace_memories 
    USING hnsw (embedding vector_cosine_ops);
```

### 4.3 Memory Retrieval

At the start of each task or chat, relevant memories are retrieved:

```python
async def retrieve_memories(
    workspace_id: UUID,
    query: str,
    top_k: int = 5,
    db: AsyncSession = ...,
) -> list[MemoryItem]:
    query_embedding = await embed_chunk(query)
    
    results = await db.execute(
        select(WorkspaceMemory, WorkspaceMemory.embedding.cosine_distance(query_embedding).label("distance"))
        .where(WorkspaceMemory.workspace_id == workspace_id)
        .order_by("distance")
        .limit(top_k)
    )
    
    memories = [row.WorkspaceMemory for row in results]
    
    # Update access metadata
    for m in memories:
        m.last_accessed_at = datetime.utcnow()
        m.access_count += 1
    await db.commit()
    
    return memories
```

---

## 5. Memory Injection

Retrieved memories are formatted and injected into the system prompt:

```python
def format_memories_for_prompt(memories: list[MemoryItem]) -> str:
    if not memories:
        return ""
    
    lines = ["## Workspace Memory (from previous sessions):\n"]
    for m in memories:
        lines.append(f"- [{m.memory_type.upper()}] {m.content}")
    
    return "\n".join(lines)
```

Example injected memory block:
```
## Workspace Memory (from previous sessions):

- [ARCHITECTURE] Authentication uses JWT with HS256, 30-min access tokens, 30-day refresh tokens stored hashed in PostgreSQL.
- [CONVENTION] Tests use pytest-asyncio with anyio backend. Test DB is a separate PostgreSQL instance via Docker Compose.
- [CONVENTION] All API routes are prefixed /api/v1/. Breaking changes get a new version prefix.
- [BUG] The git commit message generation fails when the diff is empty — check for staged changes before calling the AI.
- [DEPENDENCY] Using SQLAlchemy 2.0 with async engine (asyncpg driver). No synchronous DB calls allowed.
```

---

## 6. Memory Management UI

Users can view and manage workspace memories from Settings → Workspace → Memory:

- Browse all stored memories (filterable by type, source, date).
- Delete individual memories.
- Add memories manually ("Remember: we always use kebab-case for CSS class names").
- Clear all memories for a workspace.

---

## 7. Memory Decay and Pruning

To prevent stale memories from polluting the context:

- Memories older than 180 days that have `access_count < 2` are candidates for pruning.
- A weekly Celery task identifies and deletes these.
- High-access memories (`access_count > 10`) are never auto-pruned.
- Users can manually pin memories to prevent pruning.

---

## 8. Conversation Memory (Chat History)

The full conversation history (all messages) is persisted in the `messages` table. This is used for:

1. **Continuity:** Loading previous messages when the user reopens a chat session.
2. **Memory extraction:** Processing the session after it ends.
3. **Search:** Users can search past chat content.

Chat history is NOT injected into the context wholesale (too many tokens). Instead:
- The last N messages are included (enough for continuity).
- Earlier messages are summarized on demand.
- Specific past messages can be retrieved via semantic search over the messages content.

---

## 9. Cross-Workspace Memory

By default, memories are workspace-scoped. A "global" memory scope can be enabled:

```json
{
  "ai": {
    "enableGlobalMemory": true
  }
}
```

Global memories are retrieved in addition to workspace-scoped ones. Useful for personal conventions (e.g., "I prefer explicit return types in TypeScript").

Global memories are stored with `workspace_id = NULL` in the `workspace_memories` table.
