from __future__ import annotations

import json
from collections.abc import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from redis.asyncio import Redis
from starlette import status

from app.core.config import get_settings
from app.core.dependencies import CurrentUserDep, RedisDep
from app.core.errors import ValidationError
from app.infrastructure.ai.context_manager import CONTEXT_WINDOWS
from app.infrastructure.ai.model_router import resolve_provider_name
from app.infrastructure.ai.ollama_registry import OllamaRegistry

router = APIRouter(prefix="/models", tags=["models"])


class ModelInfoSchema(BaseModel):
    id: str
    provider: str
    context_window: int
    available: bool


class ModelListSchema(BaseModel):
    items: list[ModelInfoSchema]


class OllamaModelInfoSchema(BaseModel):
    name: str
    size_bytes: int
    modified_at: str


class OllamaModelListSchema(BaseModel):
    items: list[OllamaModelInfoSchema]


class PullOllamaModelRequestSchema(BaseModel):
    name: str


async def _is_provider_available(redis: Redis, provider_name: str) -> bool:
    # Written every `CHECK_INTERVAL_SECONDS` by `ProviderAvailabilityChecker` — a missing key
    # (never checked yet, or the TTL lapsed because the checker isn't running) means "unknown,"
    # which is treated as unavailable rather than optimistically `True` per MODEL_ROUTER.md §11.
    flag = await redis.get(f"provider:available:{provider_name}")
    # `redis-py`'s stubs return `Any` here (pinned to an older minor by `celery[redis]`'s own
    # `kombu` dependency, which lags the newer, more precisely typed releases) — `bool(...)`
    # forces a concrete `bool` rather than letting `Any` silently propagate out of this function.
    return bool(flag == "1")


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


@router.get("/ollama/installed", response_model=OllamaModelListSchema)
async def list_ollama_models(user: CurrentUserDep) -> OllamaModelListSchema:
    """`docs/reference/ollama/ANALYSIS.md` §8's real, previously-untracked gap: no desktop UI to
    manage the Ollama models this app's local-model routing actually depends on — a user had to
    already know to run the `ollama` CLI directly. Registered ahead of the `/{model_id}` route
    below (same segment count, static beats parameterized) so `GET /models/ollama/installed`
    can't be shadowed by it."""
    registry = OllamaRegistry(get_settings().ollama_base_url)
    try:
        models = await registry.list_models()
    finally:
        await registry.aclose()
    return OllamaModelListSchema(
        items=[
            OllamaModelInfoSchema(name=m.name, size_bytes=m.size_bytes, modified_at=m.modified_at)
            for m in models
        ]
    )


@router.post("/ollama/pull")
async def pull_ollama_model(body: PullOllamaModelRequestSchema, user: CurrentUserDep) -> StreamingResponse:
    """Streams Ollama's own real download progress back to the caller as newline-delimited JSON,
    one line per `OllamaRegistry.pull_model()` yield — a direct HTTP streaming response rather
    than this app's usual WebSocket-event pattern (`index_progress` etc.), since a model pull has
    no natural workspace to scope a `ws:workspace:{id}:...` channel to (Ollama is one shared local
    server, not a per-workspace resource); inventing a fake workspace association just to reuse
    the existing channel shape would be the wrong fit, not a simplification."""
    registry = OllamaRegistry(get_settings().ollama_base_url)

    async def event_stream() -> AsyncIterator[bytes]:
        try:
            async for progress in registry.pull_model(body.name):
                yield (
                    json.dumps(
                        {
                            "status": progress.status,
                            "total": progress.total,
                            "completed": progress.completed,
                            "error": progress.error,
                        }
                    )
                    + "\n"
                ).encode()
        finally:
            await registry.aclose()

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")


@router.delete("/ollama/{model_name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ollama_model(model_name: str, user: CurrentUserDep) -> None:
    registry = OllamaRegistry(get_settings().ollama_base_url)
    try:
        await registry.delete_model(model_name)
    finally:
        await registry.aclose()


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
