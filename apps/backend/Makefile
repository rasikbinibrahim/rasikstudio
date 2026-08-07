.PHONY: dev test lint typecheck migrate

dev:
	uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

test:
	uv run pytest

lint:
	uv run ruff check app/ tests/

typecheck:
	uv run mypy app/

# Advisory-lock-protected `alembic upgrade head` — see scripts/check_migration_lock.py and
# alembic/README.md. Never run automatically on app startup (ADR 0009); this is the one blessed
# way to apply migrations.
migrate:
	uv run python scripts/check_migration_lock.py
