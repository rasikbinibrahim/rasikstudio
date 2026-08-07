from collections.abc import AsyncGenerator

from redis.asyncio import ConnectionPool, Redis

from app.core.config import get_settings

_settings = get_settings()

redis_pool = ConnectionPool.from_url(_settings.redis_url, max_connections=50, decode_responses=True)


async def get_redis() -> AsyncGenerator[Redis, None]:
    # `connection_pool=` is passed explicitly, so exiting this `async with` block returns the
    # connection to the shared pool rather than tearing the pool itself down.
    async with Redis(connection_pool=redis_pool) as client:
        yield client
