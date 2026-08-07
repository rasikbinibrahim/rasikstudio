from __future__ import annotations

import asyncio
from dataclasses import dataclass

from app.infrastructure.ai.availability_checker import ProviderAvailabilityChecker


class FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, tuple[int, int]] = {}

    async def set(self, key: str, value: int, ex: int) -> None:
        self.store[key] = (value, ex)


@dataclass
class FakeProvider:
    available: bool = True
    raises: bool = False

    async def is_available(self) -> bool:
        if self.raises:
            raise RuntimeError("boom")
        return self.available


class TestCheckOnce:
    async def test_writes_1_for_an_available_provider(self) -> None:
        redis = FakeRedis()
        checker = ProviderAvailabilityChecker({"ollama": FakeProvider(available=True)}, redis)

        await checker.check_once()

        assert redis.store["provider:available:ollama"] == (1, 120)

    async def test_writes_0_for_an_unavailable_provider(self) -> None:
        redis = FakeRedis()
        checker = ProviderAvailabilityChecker({"ollama": FakeProvider(available=False)}, redis)

        await checker.check_once()

        assert redis.store["provider:available:ollama"] == (0, 120)

    async def test_a_provider_that_raises_is_recorded_as_unavailable_without_crashing_the_loop(
        self,
    ) -> None:
        redis = FakeRedis()
        checker = ProviderAvailabilityChecker(
            {"broken": FakeProvider(raises=True), "healthy": FakeProvider(available=True)}, redis
        )

        await checker.check_once()

        assert redis.store["provider:available:broken"] == (0, 120)
        assert redis.store["provider:available:healthy"] == (1, 120)


class TestStartStop:
    async def test_start_runs_a_check_and_stop_cancels_the_loop_cleanly(self) -> None:
        redis = FakeRedis()
        checker = ProviderAvailabilityChecker({"ollama": FakeProvider(available=True)}, redis)

        checker.start()
        await asyncio.sleep(0.05)
        await checker.stop()

        assert redis.store["provider:available:ollama"] == (1, 120)
