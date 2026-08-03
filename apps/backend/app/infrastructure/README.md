# apps/backend/app/infrastructure/

Concrete implementations of the domain ports. This layer knows about external systems: PostgreSQL, Redis, Ollama, Anthropic, Playwright. Application layer code depends only on the port interfaces, never on these concrete classes directly.

## Subdirectories

| Directory | External System | Implements |
|---|---|---|
| `ai/` | Ollama, Anthropic, OpenAI, Gemini | `AIProvider` port, `ModelRouter` |
| `browser/` | Playwright | Agent browser automation |
| `cache/` | Redis | `Cache` port, pub/sub publisher |
| `db/` | PostgreSQL + SQLAlchemy | All repository ports |
| `vector/` | PostgreSQL + pgvector | `VectorStore` port |

## Dependency Direction

Infrastructure depends on domain (`domain/ports/` and `domain/models/`). Domain never depends on infrastructure. If you find yourself importing from `infrastructure/` inside `domain/`, that is an architecture violation.
