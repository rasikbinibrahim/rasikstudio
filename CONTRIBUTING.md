# Contributing to Rasik Studio

Every command below was run for real while writing this guide (see each step's own note) — this
isn't a design-time sketch of what the workflow *should* be.

## Prerequisites

- **Node.js 20+** and **pnpm 9+** (`corepack enable` is the easiest way to get pnpm)
- **Python 3.12+** and **[uv](https://docs.astral.sh/uv/)**
- **Docker** (for local Postgres + Redis — no local install of either needed)
- **git**

## 1. Clone and install

```bash
git clone <this repository's URL>
cd rasik-studio
make install   # pnpm install (desktop + backend workspace) + uv sync (backend)
```

## 2. Start the dev environment

```bash
make dev
```

This one command:
1. Starts Postgres (with `pgvector`) and Redis via `docker compose up -d db redis` — **not** the
   full `docker compose up`, which would also build and run a production-mode backend container
   instead of the live-reload one you want for development.
2. Applies database migrations (`alembic upgrade head`, advisory-lock-protected so two instances
   starting at once can't race — see `apps/backend/scripts/check_migration_lock.py`).
3. Runs `pnpm dev`, which starts the backend (`uvicorn --reload` on `http://127.0.0.1:8000`) and
   the desktop app (`electron-vite dev`, live-reloading renderer at `http://localhost:5173`)
   together via Turborepo.

The backend needs no `.env` file for local development — `apps/backend/app/core/config.py`'s
`Settings` defaults (`postgresql+asyncpg://rasik:rasik@localhost:5432/rasik_studio`,
`redis://localhost:6379/0`) already match `docker-compose.yml`'s exposed ports. Only real
deployments need to override `SECRET_KEY`/`ENCRYPTION_KEY`/database credentials.

**Agent tasks need a Celery worker too** (ADR 0004) — `make dev` alone starts the API and desktop
app but nothing consumes the agent-task queue, so `POST /api/v1/agents/tasks` would queue a task
that never runs. Run `make worker` in a separate terminal alongside `make dev` to actually process
agent tasks locally:

```bash
make worker
```

**A note on this exact repository's own dev sandbox, not a general Linux issue:** if you see
`error while loading shared libraries: libnspr4.so: ...` when Electron tries to launch, your
machine is missing NSS/ALSA shared libraries Electron's Chromium build needs — install them via
your distro's package manager (`libnspr4`, `libnss3`, `libasound2` on Debian/Ubuntu). A normal
desktop Linux install already has these; this only came up while verifying this guide inside a
minimal sandboxed container with no display server or package-install permissions (see
`CHANGELOG.md`'s Phase 13/15/16 entries for how that was worked around for *this project's own*
verification purposes — nothing a real contributor's machine needs to replicate).

## 3. Make your change

- Desktop app code: `apps/desktop/` (Electron main process in `electron/`, React renderer in `src/`)
- Backend code: `apps/backend/app/` (Clean Architecture layers — see `BACKEND_ARCHITECTURE.md`)
- Shared architecture/design docs live at the repo root (`AI_ARCHITECTURE.md`,
  `DATABASE_DESIGN.md`, etc.) — read the one relevant to what you're touching before making a
  structural change, and update it if your change makes it inaccurate.

## 4. Test, lint, typecheck — before opening a PR

```bash
make test        # pnpm test — backend pytest (coverage-gated at 85%) + desktop vitest (gated at 80%)
make lint         # pnpm lint — ruff (backend) + eslint (desktop)
make typecheck    # pnpm typecheck — mypy (backend) + tsc across 3 desktop TS projects (app, main process, e2e tests)
```

All three are exactly what CI's `test.yml` runs — if these pass locally, CI will pass on the same
code (barring an environment difference CI itself would need to surface, like the Electron E2E
step's `Xvfb` requirement — see `apps/desktop/tests/e2e/`'s own docs if you're touching desktop UI
and want to run those locally too).

## 5. Commit and open a PR

- Follow the existing commit style in `git log` — short, present-tense summary line; body
  explains *why*, not just *what* (the diff already shows what changed).
- `CHANGELOG.md` is updated per-phase/per-feature by whoever's doing the work, following [Keep a
  Changelog](https://keepachangelog.com/en/1.1.0/)'s format — add an entry under `[Unreleased]`
  for anything user-visible.
- Open the PR against `main`. `test.yml` and `security.yml` both run automatically; both must
  pass before merging.
- Branch naming isn't currently enforced by tooling — use whatever's clear (`fix/`, `feat/`,
  a ticket id, etc.).

## Coding standards

- **No placeholder implementations, no stub code left in "done" work** — if something is
  genuinely out of scope right now, it's not built at all, and the gap is recorded in `TASKS.md`,
  not silently stubbed.
- **Clean Architecture** on the backend (`app/domain/` has no framework dependencies;
  `app/application/` orchestrates use cases; `app/infrastructure/` is where FastAPI/SQLAlchemy/
  Redis/provider SDKs actually live) — see `BACKEND_ARCHITECTURE.md`.
- **Real verification over assumed correctness.** Every phase in this project's history
  (`PROGRESS.md`) was built and verified against real infrastructure wherever the environment
  allowed — real Postgres/Redis via testcontainers, a real git repository, a real Docker daemon,
  a real (if unusually launched) Electron process — rather than mocking away anything that could
  reasonably be run for real. Follow that same standard for new work.
- **Comments explain *why*, not *what*.** Well-named code already says what it does; a comment
  earns its place by capturing a non-obvious constraint, a workaround for a specific bug, or a
  reason a simpler-looking approach wouldn't work.

## Where things are tracked

- `PROGRESS.md` — phase-by-phase status, the single source of truth for what's actually built
  (verified against the repository, not against what was planned).
- `CHANGELOG.md` — chronological record of what shipped.
- `TASKS.md` — granular backlog: deferred items, known gaps, follow-ups.
- `docs/roadmap/` — the 18-phase build plan, one file per phase, each with its own acceptance
  criteria.
