from __future__ import annotations

import uuid

import structlog
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = structlog.get_logger("errors")


class RasikStudioError(Exception):
    """Base for all domain-raised errors. Subclasses set `code`/`status_code` as class defaults;
    both can be overridden per-raise (e.g. `AuthError("...", status_code=403)`) since some error
    families map to more than one HTTP status."""

    code: str = "internal_error"
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR

    def __init__(self, message: str, *, code: str | None = None, status_code: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code


class AuthError(RasikStudioError):
    code = "auth_error"
    status_code = status.HTTP_401_UNAUTHORIZED


class WorkspaceError(RasikStudioError):
    code = "workspace_error"
    status_code = status.HTTP_404_NOT_FOUND


class AIError(RasikStudioError):
    code = "ai_error"
    status_code = status.HTTP_502_BAD_GATEWAY


class ModelUnavailableError(AIError):
    """Provider unreachable or reports itself unhealthy. `ModelRouter` catches this specifically
    to trigger the next model in the fallback chain (see `infrastructure/ai/model_router.py`)."""

    code = "model_unavailable"
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE


class ModelRateLimitError(AIError):
    code = "model_rate_limited"
    status_code = status.HTTP_429_TOO_MANY_REQUESTS


class ContextWindowExceededError(AIError):
    """Raised only if truncation still leaves the request over budget (e.g. a single message
    larger than the whole context window) — normal truncation happens silently before the
    provider call and never reaches this."""

    code = "context_window_exceeded"
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT


class ProviderAuthError(AIError):
    """The provider rejected our API key — distinct from this app's own `AuthError` (which is
    about *our* users' sessions, not our credentials to a third-party AI API)."""

    code = "provider_auth_error"
    status_code = status.HTTP_502_BAD_GATEWAY


class StorageError(RasikStudioError):
    code = "storage_error"
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR


class AgentError(RasikStudioError):
    """Agent-task-lifecycle errors (`application/agents/*.py`) — 404 by default (not found /
    not yours, don't-leak-existence, same as `WorkspaceError`), overridden per-raise for the
    "wrong state" cases (`agent_task_not_paused`, `agent_task_not_active`) that are really a
    409 conflict, not a missing resource."""

    code = "agent_error"
    status_code = status.HTTP_404_NOT_FOUND


class ValidationError(RasikStudioError):
    code = "validation_error"
    status_code = status.HTTP_422_UNPROCESSABLE_CONTENT


class ChatError(RasikStudioError):
    """Chat-session-lifecycle errors (`application/chat/*.py`) — 404 by default (not found / not
    yours, same don't-leak-existence principle as `WorkspaceError`/`AgentError`)."""

    code = "chat_error"
    status_code = status.HTTP_404_NOT_FOUND


def error_response(request: Request, *, code: str, message: str, status_code: int) -> JSONResponse:
    """Builds the standard `{"error": {code, message, request_id}}` envelope. Public so other
    exception handlers registered elsewhere (e.g. the rate limiter's `RateLimitExceeded` handler)
    produce the same shape instead of inventing their own."""
    # RequestLoggerMiddleware runs ahead of routing/exception handling in the middleware stack,
    # so request.state.request_id is normally already set; the fallback only matters for requests
    # that never reached that middleware (e.g. a bare TestClient without the full app stack).
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "request_id": request_id}},
    )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(RasikStudioError)
    async def handle_rasik_error(request: Request, exc: RasikStudioError) -> JSONResponse:
        if exc.status_code >= 500:
            logger.error("domain_error", code=exc.code, message=exc.message)
        return error_response(request, code=exc.code, message=exc.message, status_code=exc.status_code)

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = "not_found" if exc.status_code == status.HTTP_404_NOT_FOUND else "http_error"
        message = exc.detail if isinstance(exc.detail, str) else "Request failed"
        return error_response(request, code=code, message=message, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return error_response(
            request,
            code="validation_error",
            message="Request validation failed",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_exception")
        return error_response(
            request,
            code="internal_error",
            message="An unexpected error occurred",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
