# apps/backend/tests/integration/

Integration tests that run against real external services — PostgreSQL and Redis — via Docker containers managed by `testcontainers-python`.

## Setup

```python
# conftest.py (this directory)
@pytest.fixture(scope="session")
def postgres_container():
    with PostgresContainer("pgvector/pgvector:pg16") as pg:
        yield pg

@pytest.fixture(scope="session")
def redis_container():
    with RedisContainer("redis:7-alpine") as redis:
        yield redis
```

## Rules

- **Never mock the database in integration tests.** This is the most important rule. See TESTING_STRATEGY.md. The purpose of integration tests is to verify that the application works with real infrastructure.
- Integration tests are slower (~5–30s per test class). They run in CI but not in the `pnpm dev` watch loop.
- Each test function gets a clean database transaction that is rolled back after the test — no cross-test state pollution.
- Use `pytest-asyncio` with `asyncio_mode = "auto"` for all async test functions.
