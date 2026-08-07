import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.errors import (
    AIError,
    AuthError,
    RasikStudioError,
    StorageError,
    ValidationError,
    WorkspaceError,
    register_exception_handlers,
)


@pytest.mark.parametrize(
    ("error_cls", "expected_code", "expected_status"),
    [
        (AuthError, "auth_error", 401),
        (WorkspaceError, "workspace_error", 404),
        (AIError, "ai_error", 502),
        (StorageError, "storage_error", 500),
        (ValidationError, "validation_error", 422),
    ],
)
def test_subclass_default_code_and_status(
    error_cls: type[RasikStudioError], expected_code: str, expected_status: int
) -> None:
    err = error_cls("something went wrong")

    assert err.code == expected_code
    assert err.status_code == expected_status
    assert err.message == "something went wrong"


def test_status_code_override_at_raise_time() -> None:
    # AuthError defaults to 401, but the error family also covers 403 (per phase-04's doc:
    # "AuthError (401/403)") — the constructor override exists specifically for this case.
    err = AuthError("forbidden", status_code=403)

    assert err.status_code == 403
    assert err.code == "auth_error"


@pytest.fixture
def app_with_test_route() -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/boom-domain")
    def boom_domain() -> None:
        raise AIError("upstream model unavailable")

    @app.get("/boom-unexpected")
    def boom_unexpected() -> None:
        raise RuntimeError("this should never leak to the client")

    return app


def test_domain_error_produces_standard_schema(app_with_test_route: FastAPI) -> None:
    client = TestClient(app_with_test_route, raise_server_exceptions=False)

    response = client.get("/boom-domain")

    assert response.status_code == 502
    body = response.json()
    assert body["error"]["code"] == "ai_error"
    assert body["error"]["message"] == "upstream model unavailable"
    assert "request_id" in body["error"]


def test_unknown_route_returns_standard_schema(app_with_test_route: FastAPI) -> None:
    client = TestClient(app_with_test_route, raise_server_exceptions=False)

    response = client.get("/this-route-does-not-exist")

    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "not_found"
    assert "request_id" in body["error"]


def test_unhandled_exception_does_not_leak_details(app_with_test_route: FastAPI) -> None:
    client = TestClient(app_with_test_route, raise_server_exceptions=False)

    response = client.get("/boom-unexpected")

    assert response.status_code == 500
    body = response.json()
    assert body["error"]["code"] == "internal_error"
    assert "RuntimeError" not in body["error"]["message"]
    assert "leak" not in body["error"]["message"]
