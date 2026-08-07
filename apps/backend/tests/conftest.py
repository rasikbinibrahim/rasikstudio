import pytest

from app.core.config import get_settings


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    """`get_settings()` is `@lru_cache`d in production so every call returns the same instance
    without re-parsing the environment on every request. In tests that means a stale cached
    `Settings` can leak between tests that set different env vars — clear it before and after
    every test so each one gets a fresh read."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
