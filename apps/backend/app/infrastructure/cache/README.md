# apps/backend/app/infrastructure/cache/

Redis client and caching utilities. Implements the `Cache` port from `domain/ports/cache.py`.

## Files (to be created in Phase 4)

| File | Purpose |
|---|---|
| `redis_client.py` | Async Redis connection pool, `get_redis()` dependency |
| `cache_service.py` | `CacheService` — get, set, delete with typed wrappers and TTL management |
| `rate_limiter.py` | slowapi Redis backend configuration |

## Redis Key Namespace Conventions

See `DATABASE_DESIGN.md §6` for the canonical table of every Redis key pattern, type, and TTL used across the backend — `CacheService` is simply the typed access layer over that namespace.

All keys are prefixed with `rasik:` in production to avoid collisions in shared Redis instances.
