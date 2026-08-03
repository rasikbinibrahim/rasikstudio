# apps/backend/app/domain/

The domain layer — the heart of Clean Architecture. Contains pure Python: no FastAPI, no SQLAlchemy, no Redis, no HTTP. This code is the most stable in the system — it changes only when business rules change, never when infrastructure changes.

## Subdirectories

| Directory | Contents |
|---|---|
| `models/` | Pure Python dataclasses representing business entities |
| `ports/` | Abstract interfaces (Protocols) for repositories and services |
| `services/` | Domain logic functions and classes with no I/O |

## The Dependency Rule

Nothing in `domain/` imports from `api/`, `application/`, `agents/`, `infrastructure/`, or `core/`. The domain is the innermost circle. All other layers depend on it; it depends on nothing.

## Why This Matters

Decoupling the domain from SQLAlchemy means: swapping PostgreSQL for another database requires only new infrastructure implementations, not domain changes. The domain models are tested without any database setup.
