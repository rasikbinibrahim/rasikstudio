# ADR 0002: Backend Framework — FastAPI

## Status

Accepted (2026-08-03)

## Context

The backend needs: async I/O throughout (streaming AI responses, WebSocket gateway, concurrent
DB/Redis/provider calls), automatic request/response validation, and a machine-readable API
schema the desktop app's types can be generated from (see ADR 0007).

## Decision

Use FastAPI (over Django, Flask, or a bare ASGI framework like Starlette directly).

## Rationale

- **Native async support** — every I/O-bound operation in this system (DB queries, Redis,
  outbound AI provider HTTP calls, WebSocket messages) is async; FastAPI's request handlers are
  async-native rather than async-bolted-on (Flask/Django's async support is comparatively new and
  less idiomatic throughout their own ecosystems).
- **Pydantic-based validation and OpenAPI generation are automatic**, not a separate
  serialization layer to hand-maintain — every route's request/response models are also the
  source of the `/openapi.json` schema `packages/desktop-types/` generates TypeScript types from.
- **Dependency injection (`Depends()`)** is a good structural fit for Clean Architecture's
  composition root — `core/dependencies.py` constructs concrete infrastructure adapters
  (`get_db`, `get_redis`, `get_current_user`) for use cases that otherwise depend only on domain
  ports.

## Alternatives Considered

- **Django** — batteries-included (admin, ORM, auth) but its ORM and request lifecycle are
  synchronous-first; would have meant either fighting the framework for async or adopting
  Django's newer async views/ORM support, which is less mature than FastAPI's async-native design.
- **Flask** — minimal and familiar, but no built-in validation/OpenAPI generation and weaker
  async support; would have meant hand-building what FastAPI provides.
- **Bare Starlette** — FastAPI is itself built on Starlette; going bare would mean reimplementing
  Pydantic integration and OpenAPI generation by hand for no real benefit.

## Consequences

- Pydantic v2 is a hard dependency throughout every layer that touches request/response schemas.
- The domain layer must stay Pydantic-free (per `BACKEND_ARCHITECTURE.md`'s layer rules) so
  business logic doesn't leak framework-specific validation concerns — enforced by convention and
  code review, not a lint rule.

## Outcome

Confirmed correct through Phase 16 — every backend phase (4 through 16) built on FastAPI without
needing to work around it. The domain-layer-stays-Pydantic-free rule held with one documented,
deliberate exception (`core/dependencies.py`, the DI composition root — see the Decisions Log).
Auto-generated OpenAPI/TypeScript type generation (this ADR's original motivating rationale) was
finally exercised for real in Phase 17 — see ADR 0007's own Outcome section for that half of the
story, which took longer to actually wire up than this decision assumed.
