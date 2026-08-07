from __future__ import annotations

import asyncio
import contextlib

import structlog
from redis.asyncio import Redis

from app.domain.ports.ai_provider import AIProvider

logger = structlog.get_logger("ai.availability_checker")

CHECK_INTERVAL_SECONDS = 60
REDIS_KEY_TTL_SECONDS = 120


class ProviderAvailabilityChecker:
    """Background task, started once at app startup (mirrors `RedisEventSubscriber`'s lifecycle
    in `core/events.py`): pings every provider's `is_available()` on an interval and writes the
    result to Redis so `GET /api/v1/models` can report real-time availability without every
    request re-pinging four external services on the request path — see MODEL_ROUTER.md §11."""

    def __init__(self, providers: dict[str, AIProvider], redis: Redis) -> None:
        self._providers = providers
        self._redis = redis
        self._task: asyncio.Task[None] | None = None
        self._stopped = asyncio.Event()

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stopped.set()
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task

    async def _run(self) -> None:
        while not self._stopped.is_set():
            await self.check_once()
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._stopped.wait(), timeout=CHECK_INTERVAL_SECONDS)

    async def check_once(self) -> None:
        for name, provider in self._providers.items():
            try:
                available = await provider.is_available()
            except Exception:
                logger.warning("provider_check_failed", provider=name)
                available = False
            await self._redis.set(f"provider:available:{name}", int(available), ex=REDIS_KEY_TTL_SECONDS)
