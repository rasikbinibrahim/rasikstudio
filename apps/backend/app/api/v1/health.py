import structlog
from fastapi import APIRouter
from sqlalchemy import text

from app.core.dependencies import DbDep, RedisDep

logger = structlog.get_logger("health")

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    """Always 200 — for load balancers."""
    return {"status": "ok"}


@router.get("/health/live")
def health_live() -> dict[str, str]:
    """200 if the process is running."""
    return {"status": "ok"}


@router.get("/health/ready")
async def health_ready(db: DbDep, redis: RedisDep) -> dict[str, object]:
    """200 once dependencies are reachable — checked on every call rather than cached, since a
    stale "ready" answer is worse than a slightly slower one for an orchestrator deciding whether
    to route traffic here."""
    checks: dict[str, str] = {}

    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = "connected"
    except Exception:
        logger.warning("health_check_database_failed", exc_info=True)
        checks["database"] = "unreachable"

    try:
        await redis.ping()
        checks["redis"] = "connected"
    except Exception:
        logger.warning("health_check_redis_failed", exc_info=True)
        checks["redis"] = "unreachable"

    status = "ready" if all(v == "connected" for v in checks.values()) else "degraded"
    return {"status": status, "checks": checks}
