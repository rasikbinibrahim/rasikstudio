import asyncio
import socket
from collections.abc import AsyncGenerator, Generator

import pytest
import uvicorn
from alembic.config import Config
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from testcontainers.community.postgres import PostgresContainer
from testcontainers.community.redis import RedisContainer

from alembic import command
from app.core.config import get_settings
from app.infrastructure.cache.redis_client import get_redis
from app.infrastructure.db.session import get_db
from app.main import create_app

# Real Postgres+Redis via Docker, per phase-04/phase-05's "no mocking of infrastructure in
# integration tests" rule. Session-scoped so every integration test in the run shares one pair of
# containers instead of paying Docker startup cost per test.


@pytest.fixture(scope="session")
def postgres_container() -> Generator[PostgresContainer, None, None]:
    with PostgresContainer("pgvector/pgvector:pg16", driver="asyncpg") as container:
        yield container


@pytest.fixture(scope="session")
def redis_container() -> Generator[RedisContainer, None, None]:
    with RedisContainer("redis:7-alpine") as container:
        yield container


@pytest.fixture(scope="session")
def database_url(postgres_container: PostgresContainer) -> str:
    return postgres_container.get_connection_url()


@pytest.fixture(scope="session")
def redis_url(redis_container: RedisContainer) -> str:
    host = redis_container.get_container_host_ip()
    port = redis_container.get_exposed_port(redis_container.port)
    return f"redis://{host}:{port}/0"


@pytest.fixture(scope="session")
def _migrated_schema(database_url: str) -> None:
    """Runs the real `alembic upgrade head` against the testcontainer once per session — the
    ephemeral Postgres starts schema-less. Shared across `tests/integration/**` (not just
    `infrastructure/`) since auth/api tests need real tables too, not just repository tests.
    Explicitly setting `sqlalchemy.url` here (rather than relying on Settings/DATABASE_URL) is
    exactly the override path alembic/env.py added for this purpose."""
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(cfg, "head")


@pytest.fixture
async def test_app(database_url: str, redis_url: str, _migrated_schema: None):
    """A `create_app()` instance whose `get_db`/`get_redis` dependencies are overridden to point
    at the testcontainers, rather than the production module-level engine/pool (which is built
    once at import time from whatever DATABASE_URL/REDIS_URL happened to be in the environment
    then — overriding by dependency callable avoids needing to reload modules to repoint it)."""
    app = create_app()

    engine = create_async_engine(database_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def override_get_redis() -> AsyncGenerator[Redis, None]:
        client: Redis = Redis.from_url(redis_url, decode_responses=True)
        try:
            yield client
        finally:
            await client.aclose()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_redis] = override_get_redis

    yield app

    await engine.dispose()


async def _start_live_server(
    database_url: str, redis_url: str, monkeypatch: pytest.MonkeyPatch
) -> AsyncGenerator[str, None]:
    """A real running server, not `TestClient`/`ASGITransport` — needed specifically for
    WebSocket tests. Starlette's `TestClient` runs WS routes in a separate portal thread with its
    own event loop, which conflicts with our async SQLAlchemy engine (`dependency_overrides`
    handles that fine for HTTP-only tests via `test_app`, but not across a thread boundary for WS).
    Running inside one real event loop — this one — avoids that entirely.

    Also routes `DATABASE_URL`/`REDIS_URL` via env vars (cleared automatically by `monkeypatch` and
    by the base `_clear_settings_cache` autouse fixture) before building the app: the WS gateway's
    Redis pub/sub subscriber is a background task started at app startup, not a per-request
    dependency, so it isn't reachable through `dependency_overrides` the way `get_db`/`get_redis`
    are — it has to get the right `redis_url` from `Settings` itself instead (see
    `core/events.py`'s `on_startup`).

    Extracted from the plain `live_server` fixture so `live_server_short_idle_timeout` can reuse
    the exact same real-server startup/teardown, differing only in an env var set beforehand."""
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("REDIS_URL", redis_url)
    get_settings.cache_clear()

    app = create_app()

    engine = create_async_engine(database_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def override_get_redis() -> AsyncGenerator[Redis, None]:
        client: Redis = Redis.from_url(redis_url, decode_responses=True)
        try:
            yield client
        finally:
            await client.aclose()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_redis] = override_get_redis

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()

    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning", lifespan="on")
    server = uvicorn.Server(config)
    serve_task = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.01)

    yield f"127.0.0.1:{port}"

    server.should_exit = True
    await serve_task
    await engine.dispose()


@pytest.fixture
async def live_server(
    database_url: str, redis_url: str, _migrated_schema: None, monkeypatch: pytest.MonkeyPatch
) -> AsyncGenerator[str, None]:
    async for base_url in _start_live_server(database_url, redis_url, monkeypatch):
        yield base_url


@pytest.fixture
async def live_server_short_idle_timeout(
    database_url: str, redis_url: str, _migrated_schema: None, monkeypatch: pytest.MonkeyPatch
) -> AsyncGenerator[str, None]:
    """Same real server as `live_server`, with `WS_IDLE_TIMEOUT_SECONDS` set low — lets the
    stale-connection cleanup path (`gateway.py`'s idle-timeout close) be verified for real, in
    well under a second, instead of needing a genuine 30-second wait."""
    monkeypatch.setenv("WS_IDLE_TIMEOUT_SECONDS", "1")
    async for base_url in _start_live_server(database_url, redis_url, monkeypatch):
        yield base_url
