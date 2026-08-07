from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest

from app.agents.context import AgentContext, EventEmitter


class FakeRedis:
    def __init__(self) -> None:
        self.published: list[tuple[str, str]] = []

    async def publish(self, channel: str, message: str) -> None:
        self.published.append((channel, message))


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
            "require_approval": True,
        }
        defaults.update(overrides)
        return AgentContext(**defaults)  # type: ignore[arg-type]

    return _make
