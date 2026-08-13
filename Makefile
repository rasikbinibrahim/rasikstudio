.PHONY: dev worker install test lint typecheck build migrate infra-up infra-down clean generate-types

# Postgres + Redis only — the backend and desktop app both run natively (live-reload), not
# through Docker, for the local dev loop. `docker-compose.yml`'s `backend` service builds the
# production image instead; that's what `docker compose up` (no service names) would run.
infra-up:
	docker compose up -d db redis

infra-down:
	docker compose down

install:
	pnpm install
	cd apps/backend && uv sync

# Brings up Postgres/Redis, applies migrations, then runs the desktop app (electron-vite, live
# reload) and backend (uvicorn --reload) together via Turborepo — the same `pnpm dev` a
# contributor would run by hand, just with the infra dependency made explicit first.
dev: infra-up migrate
	pnpm dev

# Real Celery worker (ADR 0004), run natively for local dev — same "infra separate from the app
# process" split as `infra-up`/`dev`. Agent tasks (`POST /api/v1/agents/tasks`) queue via
# `RunAgentTaskUseCase` regardless of whether a worker is running; nothing actually executes them
# until one is. Run this in its own terminal alongside `make dev` when testing agent tasks locally.
# `--pool=threads`: see app/core/celery_app.py's docstring for why prefork isn't safe here.
worker: infra-up
	cd apps/backend && uv run celery -A app.core.celery_app worker --loglevel=info --pool=threads --concurrency=4

test:
	pnpm test

lint:
	pnpm lint

typecheck:
	pnpm typecheck

build:
	pnpm build

# Advisory-lock-protected `alembic upgrade head` — see apps/backend/scripts/check_migration_lock.py
# and apps/backend/alembic/README.md. The one blessed way to apply migrations (ADR 0009); never
# run automatically on backend startup.
migrate:
	cd apps/backend && uv run python scripts/check_migration_lock.py

# Regenerates packages/desktop-types/src/api.d.ts from the backend's live OpenAPI schema (ADR
# 0007). The backend must already be running (`make dev`, or `cd apps/backend && make dev`).
generate-types:
	cd packages/desktop-types && pnpm generate

clean:
	rm -rf apps/desktop/out apps/desktop/dist apps/desktop/dist-electron
	rm -rf apps/desktop/coverage apps/backend/htmlcov apps/backend/.coverage
	find . -name "__pycache__" -not -path "*/node_modules/*" -prune -o -name "__pycache__" -exec rm -rf {} +
