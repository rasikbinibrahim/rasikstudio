import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.core.middleware.rate_limiter import limiter, register_rate_limiter


@pytest.fixture(autouse=True)
def _reset_limiter_counters():
    # `limiter` is a module-level singleton shared by every test in this process — without a
    # reset, one test exhausting its limit would poison the next test's counters for the same
    # client key (TestClient always uses the same source IP).
    limiter.reset()
    yield
    limiter.reset()


def build_app() -> FastAPI:
    app = FastAPI()
    register_rate_limiter(app)

    @app.get("/limited")
    @limiter.limit("2/minute")
    def limited(request: Request) -> dict[str, str]:  # slowapi finds the caller's rate-limit key here
        return {"ok": "true"}

    return app


def test_returns_429_after_exceeding_the_configured_limit() -> None:
    client = TestClient(build_app())

    first = client.get("/limited")
    second = client.get("/limited")
    third = client.get("/limited")

    assert first.status_code == 200
    assert second.status_code == 200
    assert third.status_code == 429
    body = third.json()
    assert body["error"]["code"] == "rate_limited"
    assert "request_id" in body["error"]
