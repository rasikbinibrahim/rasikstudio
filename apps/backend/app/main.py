from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.v1 import router as api_v1_router
from app.api.v1.health import router as health_router
from app.api.ws.gateway import router as ws_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.events import on_shutdown, on_startup
from app.core.logging import configure_logging
from app.core.middleware.cors import register_cors
from app.core.middleware.rate_limiter import register_rate_limiter
from app.core.middleware.request_logger import RequestLoggerMiddleware


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
        await on_startup(settings)
        yield
        await on_shutdown()

    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

    # Middleware executes in the order below (CORS first, closest to the router last) — but per
    # Starlette's add_middleware(), the *most recently added* ends up outermost, so registration
    # order here is deliberately the reverse of execution order. See PROGRESS.md's Decisions Log
    # for the trace through Starlette's source that pinned this down.
    register_rate_limiter(app)
    app.add_middleware(RequestLoggerMiddleware)
    register_cors(app, settings)

    register_exception_handlers(app)

    app.include_router(health_router)
    app.include_router(api_v1_router)
    app.include_router(ws_router)

    return app


app = create_app()
