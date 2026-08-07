"""Acquires a Postgres advisory lock before running `alembic upgrade head`, so two CI jobs (or two
app instances starting concurrently) can't race to apply migrations at the same time. Per
phase-05-database-layer.md's migration strategy: "alembic upgrade head is protected against
concurrent execution via pg_advisory_xact_lock" — implemented here as a session-level
pg_advisory_lock held for the whole subprocess run, rather than a transaction-scoped
pg_advisory_xact_lock, since `alembic upgrade head` can span multiple migrations/transactions and
the lock needs to outlive all of them.

Runnable standalone: `python scripts/check_migration_lock.py`
"""

from __future__ import annotations

import asyncio
import subprocess
import sys

import asyncpg

from app.core.config import get_settings

# Arbitrary, fixed 64-bit key — every instance of this script, in every environment, must use the
# same constant so they all contend for the *same* advisory lock rather than different ones.
MIGRATION_LOCK_KEY = 837_402_919


async def _run() -> int:
    settings = get_settings()
    # asyncpg.connect() wants a plain postgresql:// DSN, not SQLAlchemy's postgresql+asyncpg://.
    dsn = settings.database_url.replace("postgresql+asyncpg://", "postgresql://", 1)

    conn = await asyncpg.connect(dsn)
    try:
        acquired = await conn.fetchval("SELECT pg_try_advisory_lock($1)", MIGRATION_LOCK_KEY)
        if not acquired:
            print("Another migration is already in progress — exiting without running.", file=sys.stderr)
            return 1

        result = subprocess.run(["alembic", "upgrade", "head"], check=False)
        return result.returncode
    finally:
        # Safe to call even if the lock was never acquired (acquired=False) — pg_advisory_unlock
        # on a lock this session doesn't hold just returns false, it doesn't error.
        await conn.execute("SELECT pg_advisory_unlock($1)", MIGRATION_LOCK_KEY)
        await conn.close()


def main() -> None:
    sys.exit(asyncio.run(_run()))


if __name__ == "__main__":
    main()
