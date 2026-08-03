# Phase 2 — Folder Structure & Tooling

**Part of:** [Implementation Roadmap](README.md)
**Depends on:** Phase 1
**Estimated effort:** 3 days

---

## Objective

Create the complete directory skeleton and configure every development tool before writing application logic. A misaligned folder structure or a missing lint rule costs far more to fix later than to get right now. This phase produces no business logic — only directories, config files, and a working local development environment.

## Architecture

The full directory layout (already documented in `FOLDER_STRUCTURE.md` and `PROJECT_STRUCTURE.md`) is created as empty directories with a `README.md` in each, plus `.gitkeep`/`__init__.py` placeholders where needed:

- **Monorepo root** — `pnpm-workspace.yaml`, root `package.json`, lint/format/CI config
- **`apps/desktop/`** — Electron main/preload/services + React renderer skeleton
- **`apps/backend/`** — FastAPI app skeleton across all Clean Architecture layers

## Dependencies

- Phase 1 complete (folder structure follows ADR decisions)
- Node.js 20 LTS installed
- pnpm 9+ installed
- Python 3.12+ installed
- Docker 24+ installed

## Files to Create

**Root level:**
- `pnpm-workspace.yaml`
- `package.json` (root, with dev scripts)
- `.eslintrc.js` (TypeScript + React rules)
- `.prettierrc`
- `.editorconfig`
- `.gitignore`
- `docker-compose.yml` (dev: PostgreSQL + Redis)
- `docker-compose.prod.yml` (production)
- `Makefile` (convenience commands: `make dev`, `make test`, `make migrate`, `make lint`)

**Desktop (`apps/desktop/`):**
- `package.json`
- `tsconfig.json` (strict mode, paths configured)
- `vite.config.ts` (electron-vite)
- `electron-builder.config.ts`
- `tailwind.config.js` (semantic token mapping from `UI_DESIGN_SYSTEM.md`)
- `postcss.config.js`
- `vitest.config.ts`
- `.eslintrc.js` (React + hooks rules)
- All directory skeletons with `index.ts` barrel files

**Backend (`apps/backend/`):**
- `pyproject.toml` (Python 3.12+, all dependencies, including `celery[redis]`)
- `uv.lock`
- `alembic.ini`
- `alembic/env.py`
- `.env.example`
- `Dockerfile`
- `pytest.ini`
- `mypy.ini` (strict mode)
- `ruff.toml` (linting + formatting)
- All directory skeletons with `__init__.py`

**CI/CD (`.github/workflows/`):**
- `test.yml` (lint + type-check + unit tests on every PR)
- `release.yml` (build all platforms on tag push)
- `security.yml` (truffleHog + pip-audit + pnpm audit)
- `dependabot.yml` (weekly updates)

## Files to Modify

None — everything in this phase is new.

## Acceptance Criteria

- [ ] `pnpm install` succeeds from repo root with zero errors
- [ ] `pnpm -r run lint` passes on empty skeleton (no files to lint = pass)
- [ ] `pnpm -r run type-check` passes on empty skeleton
- [ ] `docker compose up -d` starts PostgreSQL and Redis successfully
- [ ] `curl http://localhost:5432` and `redis-cli ping` both succeed
- [ ] `cd apps/backend && python -m pytest` runs and passes (zero tests = pass)
- [ ] `cd apps/desktop && pnpm vitest` runs and passes (zero tests = pass)
- [ ] All directories exist as documented in `FOLDER_STRUCTURE.md`
- [ ] `apps/desktop/tailwind.config.js` contains all semantic tokens from `UI_DESIGN_SYSTEM.md §3.2`
- [ ] CI `test.yml` workflow runs successfully on the empty skeleton
- [ ] No TypeScript errors in any file (strict mode enabled from day one)

## Testing Strategy

Manual verification of all tooling commands. The CI workflow itself serves as the automated gate — if it passes on the skeleton, the tooling is configured correctly.

## Estimated Effort

**3 working days**
- Day 1: Root monorepo setup, pnpm workspace, Docker Compose, CI workflows
- Day 2: Desktop skeleton (all configs, directory structure, tailwind tokens)
- Day 3: Backend skeleton (`pyproject.toml`, alembic, ruff/mypy configs, Makefile)
