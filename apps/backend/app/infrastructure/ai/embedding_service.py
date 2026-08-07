from __future__ import annotations

import structlog

from app.core.errors import ModelUnavailableError
from app.domain.ports.ai_provider import AIProvider
from app.infrastructure.ai.model_router import resolve_provider_name

logger = structlog.get_logger("ai.embedding_service")


class EmbeddingService:
    """Thin wrapper around `AIProvider.embed()` that adds the `embedding` fallback chain from
    `config/fallback_chains.yaml` — `ModelRouter` itself only handles `complete`/`stream`, since
    embeddings have no streaming/tool-call/context-truncation concerns to share with it."""

    def __init__(self, providers: dict[str, AIProvider], fallback_chains: dict[str, list[str]]) -> None:
        self._providers = providers
        self._chain = fallback_chains.get("embedding", [])

    async def embed(self, texts: list[str], model: str | None = None) -> list[list[float]]:
        """Embeds the full batch in one provider call (never one string at a time — see
        MODEL_ROUTER.md §3). `model=None` walks the `embedding` fallback chain in order;
        an explicit `model` is tried once, with no fallback."""
        if not texts:
            return []
        candidates = [model] if model else self._chain
        if not candidates:
            raise ModelUnavailableError("No embedding model configured")

        last_error: ModelUnavailableError | None = None
        for candidate in candidates:
            provider_name = resolve_provider_name(candidate)
            provider = self._providers.get(provider_name)
            if provider is None:
                continue
            try:
                return await provider.embed(texts, candidate)
            except ModelUnavailableError as exc:
                logger.warning("embedding_fallback", model=candidate, error=str(exc))
                last_error = exc

        raise last_error or ModelUnavailableError("No embedding provider available")
