# apps/backend/scripts/

One-off operational and maintenance scripts. These are not part of the application — they are run manually by an administrator.

## Files (to be created as needed)

| File | Purpose |
|---|---|
| `create_superuser.py` | Bootstrap first admin user in a fresh deployment |
| `rebuild_rag_index.py` | Delete all embeddings for a workspace and trigger full re-index |
| `prune_old_memories.py` | Manually trigger memory decay pruning (normally runs weekly via Celery beat) |
| `check_migration_lock.py` | Acquires `pg_advisory_xact_lock` before running `alembic upgrade head` in CI |
| `export_workspace_data.py` | Export all user data for a workspace (GDPR compliance) |

## Rules

- Scripts must be runnable standalone: `python scripts/create_superuser.py`
- Scripts must not import from `app/api/` — they interact with the application layer directly.
- Scripts must handle their own database connection (not relying on FastAPI's DI).
- Destructive scripts (delete, prune) must require `--confirm` flag to prevent accidents.
