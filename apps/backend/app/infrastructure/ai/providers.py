from __future__ import annotations

from app.core.config import Settings, get_settings
from app.domain.ports.ai_provider import AIProvider
from app.infrastructure.ai.anthropic_provider import AnthropicProvider
from app.infrastructure.ai.gemini_provider import GeminiProvider
from app.infrastructure.ai.ollama_provider import OllamaProvider
from app.infrastructure.ai.openai_provider import OpenAIProvider


def build_providers(settings: Settings) -> dict[str, AIProvider]:
    """Every provider is always constructed — Ollama needs no key, and a cloud provider with no
    key configured simply reports `is_available() == False` (see each provider's `__init__`)
    rather than being absent from the dict, so `ModelRouter`/`EmbeddingService` always find a
    provider object to route to and only ever fail at the `is_available`/request layer."""
    return {
        "ollama": OllamaProvider(settings.ollama_base_url),
        "anthropic": AnthropicProvider(settings.anthropic_api_key),
        "openai": OpenAIProvider(settings.openai_api_key),
        "gemini": GeminiProvider(settings.gemini_api_key),
    }


async def close_providers(providers: dict[str, AIProvider]) -> None:
    for provider in providers.values():
        aclose = getattr(provider, "aclose", None)
        if aclose is not None:
            await aclose()


# Built once at import time, same convention as `infrastructure/cache/redis_client.py`'s
# `redis_pool`: every provider here owns a long-lived connection pool (httpx/SDK client), so
# `core/dependencies.py`'s `get_model_router()` reuses this instead of constructing fresh clients
# per request, which would leak sockets since nothing would ever call `aclose()` on them.
ai_providers: dict[str, AIProvider] = build_providers(get_settings())
