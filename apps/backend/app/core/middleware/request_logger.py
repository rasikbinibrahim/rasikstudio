import time
import uuid
from collections.abc import Awaitable, Callable

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = structlog.get_logger("request")


class RequestLoggerMiddleware(BaseHTTPMiddleware):
    """Assigns a request_id, logs method/path/status_code/duration_ms, and sets X-Request-ID on
    the response."""

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        start = time.perf_counter()
        with structlog.contextvars.bound_contextvars(request_id=request_id):
            response = await call_next(request)
            duration_ms = round((time.perf_counter() - start) * 1000, 2)

            logger.info(
                "request_handled",
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration_ms=duration_ms,
            )

        response.headers["X-Request-ID"] = request_id
        return response
