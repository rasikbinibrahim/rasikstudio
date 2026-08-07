from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.middleware.request_logger import RequestLoggerMiddleware


def build_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(RequestLoggerMiddleware)

    @app.get("/ping")
    def ping() -> dict[str, str]:
        return {"pong": "ok"}

    return app


def test_sets_x_request_id_header() -> None:
    client = TestClient(build_app())

    response = client.get("/ping")

    assert response.status_code == 200
    assert "x-request-id" in response.headers
    # A UUID4 string, not empty and not literally "None".
    assert len(response.headers["x-request-id"]) == 36


def test_each_request_gets_a_distinct_request_id() -> None:
    client = TestClient(build_app())

    first = client.get("/ping").headers["x-request-id"]
    second = client.get("/ping").headers["x-request-id"]

    assert first != second
