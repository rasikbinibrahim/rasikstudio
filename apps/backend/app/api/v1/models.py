from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
from redis.asyncio import Redis
from starlette import status

from app.core.dependencies import CurrentUserDep, RedisDep
from app.core.errors import ValidationError
from app.infrastructure.ai.context_manager import CONTEXT_WINDOWS
from app.infrastructure.ai.model_router import resolve_provider_name

router = APIRouter(prefix="/models", tags=["models"])


class ModelInfoSchema(BaseModel):
    id: str
    provider: str
    context_window: int
    available: bool


class ModelListSchema(BaseModel):
    items: list[ModelInfoSchema]


async def _is_provider_available(redis: Redis, provider_name: str) -> bool:
    # Written every `CHECK_INTERVAL_SECONDS` by `ProviderAvailabilityChecker` — a missing key
    # (never checked yet, or the TTL lapsed because the checker isn't running) means "unknown,"
    # which is treated as unavailable rather than optimistically `True` per MODEL_ROUTER.md §11.
    flag = await redis.get(f"provider:available:{provider_name}")
    return flag == "1"


@router.get("", response_model=ModelListSchema)
async def list_models(user: CurrentUserDep, redis: RedisDep) -> ModelListSchema:
    items = []
    for model_id, window in CONTEXT_WINDOWS.items():
        provider_name = resolve_provider_name(model_id)
        items.append(
            ModelInfoSchema(
                id=model_id,
                provider=provider_name,
                context_window=window,
                available=await _is_provider_available(redis, provider_name),
            )
        )
    return ModelListSchema(items=items)


@router.get("/{model_id}", response_model=ModelInfoSchema)
async def get_model(model_id: str, user: CurrentUserDep, redis: RedisDep) -> ModelInfoSchema:
    if model_id not in CONTEXT_WINDOWS:
        raise ValidationError(
            f"Unknown model: {model_id}", code="unknown_model", status_code=status.HTTP_404_NOT_FOUND
        )
    provider_name = resolve_provider_name(model_id)
    return ModelInfoSchema(
        id=model_id,
        provider=provider_name,
        context_window=CONTEXT_WINDOWS[model_id],
        available=await _is_provider_available(redis, provider_name),
    )
