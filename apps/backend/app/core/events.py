import structlog
from redis.asyncio import Redis

from app.api.ws.connection_manager import RedisEventSubscriber, connection_manager
from app.core.config import Settings
from app.infrastructure.ai.availability_checker import ProviderAvailabilityChecker
from app.infrastructure.ai.providers import ai_providers, close_providers
from app.infrastructure.browser.playwright_service import browser_service
from app.infrastructure.cache.redis_client import redis_pool
from app.infrastructure.db.session import engine
from app.infrastructure.lsp.manager import lsp_manager

logger = structlog.get_logger("lifecycle")

_subscriber: RedisEventSubscriber | None = None
_availability_checker: ProviderAvailabilityChecker | None = None


async def on_startup(settings: Settings) -> None:
    """Deliberately does not block on a DB/Redis round-trip: liveness (`/health/live`) is about the
    process running, not its dependencies, and startup failing on a transiently-unreachable
    database would crash-loop the container instead of letting `/health/ready` report it. The
    connection pools below are lazy — they don't open a real connection until first use.

    The Redis pub/sub subscriber is the one exception that does need to actually start here (not
    lazily) — it's a background task, not a per-request connection, so there's no "first use" that
    would otherwise trigger it (BACKEND_ARCHITECTURE.md §6). It builds its own Redis client from
    `settings.redis_url` directly rather than reusing the module-level `redis_pool` singleton in
    `infrastructure/cache/redis_client.py` — that pool is constructed once at import time from
    whatever `REDIS_URL` was set then, which is exactly the kind of module-load-time freezing that
    made `get_db`/`get_redis` need `dependency_overrides` for tests; the subscriber isn't reachable
    through FastAPI's per-request DI at all (it's not a `Depends()`), so building fresh from the
    `settings` this specific `create_app()` call captured is what actually lets tests point it at
    a different Redis (e.g. a testcontainer) than the process-wide default."""
    logger.info("backend_starting", app_env=settings.app_env)

    global _subscriber, _availability_checker
    _subscriber = RedisEventSubscriber(
        Redis.from_url(settings.redis_url, decode_responses=True), connection_manager
    )
    _subscriber.start()

    # Same "build fresh from `settings` rather than reuse the module-level `redis_pool`" reasoning
    # as the subscriber above — this is also a background task outside FastAPI's per-request DI.
    _availability_checker = ProviderAvailabilityChecker(
        ai_providers, Redis.from_url(settings.redis_url, decode_responses=True)
    )
    _availability_checker.start()

    # Lazy by design (see PlaywrightBrowserService's own docstring) — this only starts the
    # idle-sweep background task, not Playwright or any browser process itself.
    browser_service.start()

    # Same lazy-start shape as `browser_service` above — only starts the idle-sweep task, not any
    # `pylsp` process (those spawn lazily on the first `get_diagnostics` tool call per workspace).
    lsp_manager.start()


async def on_shutdown() -> None:
    if _subscriber is not None:
        await _subscriber.stop()
    if _availability_checker is not None:
        await _availability_checker.stop()
    await browser_service.stop()
    await lsp_manager.stop()
    await close_providers(ai_providers)
    await engine.dispose()
    await redis_pool.disconnect()
    logger.info("backend_stopped")
