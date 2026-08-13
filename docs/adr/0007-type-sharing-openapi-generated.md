# ADR 0007: Type Sharing — OpenAPI-Generated TypeScript Types

## Status

Accepted (2026-08-03)

## Context

The desktop app (TypeScript) and backend (Python/Pydantic) need to agree on request/response
shapes for every API call. Left unmanaged, these drift silently — a backend schema change doesn't
automatically surface as a desktop-side type error.

## Decision

Generate TypeScript types for the desktop app directly from the backend's OpenAPI schema
(`openapi-typescript` against `/openapi.json`) into `packages/desktop-types/`, rather than
hand-maintaining a parallel shared-types package.

## Rationale

- **Single source of truth.** FastAPI's Pydantic models already fully describe every
  request/response shape (ADR 0002) — regenerating types from `/openapi.json` means the backend
  schema *is* the shared type definition, not a second thing to keep in sync by hand.
- **Drift becomes a diff, not a runtime surprise.** A committed, generated `api.d.ts` means a
  backend schema change that isn't matched by regenerating types shows up as an uncommitted diff
  in CI (or a stale-looking file in review), rather than a desktop-side type error nobody notices
  until a real API call fails at runtime.

## Alternatives Considered

- **A hand-written shared `types` package**, manually kept in sync with backend schemas — the
  status quo this ADR was written to avoid; every backend field rename becomes two edits (backend
  model, hand-written type) that can silently drift apart.
- **`tRPC`-style end-to-end type inference** — not applicable here; tRPC requires both ends to be
  TypeScript, and this backend is Python.

## Consequences

- Generating types requires a running backend (`/openapi.json` is served live, not committed as a
  static file) — `make generate-types` documents this dependency explicitly.
- The generated file must be committed (per `packages/desktop-types/README.md`'s "Commitment
  Policy") so CI/reviewers can detect drift without needing to run the backend themselves.
- Desktop-only types (IPC payloads, xterm.js options, Monaco config — anything with no backend
  equivalent) stay hand-written in `apps/desktop/src/types/`, not generated — a deliberate
  boundary, not an oversight.

## Outcome

**Not implemented for most of this project's history — genuinely generated for the first time in
Phase 17 (2026-08-11), well after the desktop app had already built out its own complete,
hand-written type layer (`apps/desktop/src/types/*.ts`) across Phases 3–15.** `packages/
desktop-types/` was an empty scaffold (a README describing the intended setup, no `package.json`,
no generated file) until this phase. Phase 17 built it for real: added a real
`package.json` (making it an actual pnpm workspace member), started the real backend, fetched the
real live `/openapi.json` (23 routes), and ran `openapi-typescript` against it — genuinely
producing a real, valid `src/api.d.ts` (1645 lines, `tsc --noEmit --strict` clean) via both
command forms this ADR/the phase's own acceptance criterion name (piped through `/dev/stdin`, and
the direct-URL form).

**What this does *not* mean:** the desktop app does not yet import from `@rasik-studio/
desktop-types` anywhere — every existing type in `apps/desktop/src/types/` remains hand-written,
unchanged. Migrating the app to consume the generated types instead would mean touching every API
call site across the codebase — a real, substantial refactor, out of scope for a documentation
phase and not attempted here. The generated file now exists, is real, and is verified valid; it
is not yet *used*. That gap is the honest state of this decision as of Phase 17, tracked in
`TASKS.md`.
