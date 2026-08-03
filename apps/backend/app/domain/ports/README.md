# apps/backend/app/domain/ports/

Abstract interfaces (Python `Protocol` classes) that define what the application layer needs from infrastructure, without specifying how it's implemented.

## Files (to be created in Phase 4 and Phase 5)

| File | Interface | Implemented By |
|---|---|---|
| `user_repository.py` | `UserRepository` | `infrastructure/db/repositories/user_repository.py` |
| `workspace_repository.py` | `WorkspaceRepository` | `infrastructure/db/repositories/workspace_repository.py` |
| `chat_repository.py` | `ChatRepository` | `infrastructure/db/repositories/chat_repository.py` |
| `agent_repository.py` | `AgentRepository` | `infrastructure/db/repositories/agent_repository.py` |
| `ai_provider.py` | `AIProvider` | `infrastructure/ai/ollama_provider.py`, etc. |
| `vector_store.py` | `VectorStore` | `infrastructure/vector/pgvector_store.py` |
| `cache.py` | `Cache` | `infrastructure/cache/redis_client.py` |
| `event_publisher.py` | `EventPublisher` | `api/ws/publisher.py` |

## Why Protocols?

Python `Protocol` enables structural subtyping — infrastructure classes satisfy the interface without explicit inheritance. This makes testing easy: create a `FakeUserRepository` for unit tests without subclassing from a complex base.
