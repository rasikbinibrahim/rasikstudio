from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import uuid4

import pytest

from app.agents.context import AgentContext, EventEmitter


class FakeRedis:
    """In-memory stand-in for the handful of `redis.asyncio.Redis` commands this test suite's
    code paths actually exercise: `publish` (`EventEmitter`), and `exists`/`set`/`expire`/
    `delete`/`rpush`/`blpop` (`RunningTaskRegistry`, Redis-backed since agent task execution moved
    off `asyncio.create_task()` and onto a real Celery worker — see ADR 0004's Outcome). Not a
    general Redis emulator; extend only as new commands are actually exercised. TTLs are accepted
    but not enforced — no test here depends on a key actually expiring."""

    def __init__(self) -> None:
        self.published: list[tuple[str, str]] = []
        self._store: dict[str, str] = {}
        self._lists: dict[str, list[str]] = {}
        self._list_events: dict[str, asyncio.Event] = {}

    async def publish(self, channel: str, message: str) -> None:
        self.published.append((channel, message))

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self._store[key] = value

    async def exists(self, key: str) -> int:
        return 1 if key in self._store else 0

    async def expire(self, key: str, seconds: int) -> bool:
        return key in self._store or key in self._lists

    async def delete(self, *keys: str) -> int:
        count = 0
        for key in keys:
            if self._store.pop(key, None) is not None:
                count += 1
            if self._lists.pop(key, None) is not None:
                count += 1
        return count

    async def rpush(self, key: str, value: str) -> int:
        self._lists.setdefault(key, []).append(value)
        self._list_events.setdefault(key, asyncio.Event()).set()
        return len(self._lists[key])

    async def blpop(self, keys: list[str], timeout: int = 0) -> tuple[str, str]:
        key = keys[0]
        while not self._lists.get(key):
            event = self._list_events.setdefault(key, asyncio.Event())
            await event.wait()
            event.clear()
        return key, self._lists[key].pop(0)


@pytest.fixture
def fake_redis() -> FakeRedis:
    return FakeRedis()


@pytest.fixture
def make_context(fake_redis: FakeRedis):
    def _make(workspace_root: Path, **overrides: object) -> AgentContext:
        defaults: dict[str, object] = {
            "task_id": uuid4(),
            "workspace_id": uuid4(),
            "workspace_root": workspace_root,
            "user_id": uuid4(),
            "model": "gpt-4o-mini",
            "event_emitter": EventEmitter(fake_redis, workspace_id=uuid4(), user_id=uuid4()),
            "redis": fake_redis,
            "require_approval": True,
        }
        defaults.update(overrides)
        return AgentContext(**defaults)  # type: ignore[arg-type]

    return _make
