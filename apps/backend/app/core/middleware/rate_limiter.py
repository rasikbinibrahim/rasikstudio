from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from starlette import status

from app.core.config import get_settings
from app.core.errors import error_response

# Keyed by client IP; module-level so route handlers can add per-route overrides later
# (`@limiter.limit(...)`) without needing a second Limiter instance. `default_limits` is only
# settable at construction time (slowapi has no public setter), so this reads settings directly
# rather than waiting for register_rate_limiter() to be called.
limiter = Limiter(key_func=get_remote_address, default_limits=[get_settings().rate_limit_default])


def register_rate_limiter(app: FastAPI) -> None:
    """In-memory limiter — sufficient for a single backend process. Becomes a real gap once the
    backend runs as more than one replica (each process would track its own counter); the
    Redis-backed `rate_limit:{user_id}:{endpoint}` key documented in DATABASE_DESIGN.md §6 is the
    intended fix, deferred until per-endpoint rules (config/rate_limits.yaml, Phase 9) exist."""
    app.state.limiter = limiter
    app.add_middleware(SlowAPIMiddleware)

    @app.exception_handler(RateLimitExceeded)
    async def handle_rate_limit_exceeded(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        return error_response(
            request,
            code="rate_limited",
            message=f"Rate limit exceeded: {exc.detail}",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        )
