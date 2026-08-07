from collections.abc import AsyncGenerator

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# `_migrated_schema` lives in the parent tests/integration/conftest.py now — shared with
# tests/integration/api/ too, not just here.


@pytest.fixture
async def db_session(database_url: str, _migrated_schema: None) -> AsyncGenerator[AsyncSession, None]:
    """One outer transaction per test, rolled back afterward instead of committed — every
    repository method here only ever calls `flush()`, never `commit()`, so wrapping the whole
    test in a transaction gives free per-test isolation without needing to truncate tables."""
    engine = create_async_engine(database_url)
    async with engine.connect() as conn:
        trans = await conn.begin()
        session_factory = async_sessionmaker(bind=conn, expire_on_commit=False)
        async with session_factory() as session:
            yield session
        await trans.rollback()
    await engine.dispose()
