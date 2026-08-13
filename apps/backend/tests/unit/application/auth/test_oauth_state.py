from __future__ import annotations

from app.application.auth.oauth import consume_oauth_state, store_oauth_state


class FakeRedis:
    """Same minimal in-memory subset this codebase's other per-file `FakeRedis` fakes implement
    (see e.g. `tests/unit/application/agents/test_approve_step.py`) — just the two methods
    `store_oauth_state`/`consume_oauth_state` actually call."""

    def __init__(self) -> None:
        self._store: dict[str, str] = {}

    async def setex(self, key: str, seconds: int, value: str) -> None:
        self._store[key] = value

    async def delete(self, key: str) -> int:
        return 1 if self._store.pop(key, None) is not None else 0


class TestOAuthState:
    async def test_a_stored_state_is_consumed_successfully(self) -> None:
        redis = FakeRedis()
        await store_oauth_state(redis, "github", "the-state")  # type: ignore[arg-type]

        assert await consume_oauth_state(redis, "github", "the-state") is True  # type: ignore[arg-type]

    async def test_an_unknown_state_is_rejected(self) -> None:
        redis = FakeRedis()

        assert await consume_oauth_state(redis, "github", "never-issued") is False  # type: ignore[arg-type]

    async def test_a_state_cannot_be_replayed(self) -> None:
        redis = FakeRedis()
        await store_oauth_state(redis, "google", "one-time")  # type: ignore[arg-type]

        assert await consume_oauth_state(redis, "google", "one-time") is True  # type: ignore[arg-type]
        assert await consume_oauth_state(redis, "google", "one-time") is False  # type: ignore[arg-type]

    async def test_states_are_scoped_per_provider(self) -> None:
        redis = FakeRedis()
        await store_oauth_state(redis, "github", "shared-value")  # type: ignore[arg-type]

        assert await consume_oauth_state(redis, "google", "shared-value") is False  # type: ignore[arg-type]
        assert await consume_oauth_state(redis, "github", "shared-value") is True  # type: ignore[arg-type]
