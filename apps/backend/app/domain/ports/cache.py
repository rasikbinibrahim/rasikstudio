from __future__ import annotations

from typing import Protocol

# Interface stub (Phase 4) for the DATABASE_DESIGN.md §6 Redis key usage (sessions, rate-limit
# counters, cached model responses, indexing progress). `infrastructure/cache/redis_client.py`'s
# `get_redis()` gives raw `redis.asyncio.Redis` access today; a concrete `RedisCache` implementing
# this narrower Protocol is built once a use case actually needs one (first likely candidate:
# Phase 9's `model:cache:{hash}` response cache).


class Cache(Protocol):
    async def get(self, key: str) -> str | None: ...

    async def set(self, key: str, value: str, *, ttl_seconds: int | None = None) -> None: ...

    async def delete(self, key: str) -> None: ...

    async def increment(self, key: str, *, ttl_seconds: int | None = None) -> int: ...
