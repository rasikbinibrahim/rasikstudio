# apps/backend/app/application/

Use case layer. Each file implements exactly one business use case. Use cases orchestrate domain services and infrastructure to fulfill a specific user intent. They contain no HTTP-specific code and no direct database queries.

## Subdirectories

| Directory | Use Cases |
|---|---|
| `auth/` | Register, login, refresh token, logout, OAuth callback |
| `chat/` | Create session, send message (context build + stream trigger), delete session |
| `agents/` | Create task, run task, approve step, cancel task |
| `workspaces/` | Create workspace, open workspace, index workspace (trigger RAG) |
| `rag/` | Index file, search semantic, delete file index |
| `memory/` | Extract memories from session, retrieve relevant memories |

## Pattern

Each use case file contains one class, one public method:

```python
class SendMessageUseCase:
    def __init__(self, chat_repo, model_router, ws_publisher, memory_repo): ...

    async def execute(self, request: SendMessageRequest) -> None:
        # 1. Build context (workspace + files + RAG + history)
        # 2. Stream to model
        # 3. Publish stream_chunk events via ws_publisher
        # 4. Save completed message
```

## Rules

- Use cases accept repository and service interfaces (ports) — never concrete implementations.
- Use cases do not know about HTTP, WebSocket, or Celery — they are I/O-agnostic.
- One file = one use case. No mega-classes with many methods.
