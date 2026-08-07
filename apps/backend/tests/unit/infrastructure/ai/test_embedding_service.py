from __future__ import annotations

from dataclasses import dataclass, field

import pytest

from app.core.errors import ModelUnavailableError
from app.infrastructure.ai.embedding_service import EmbeddingService

FALLBACK_CHAINS = {"embedding": ["nomic-embed-text", "text-embedding-3-small"]}


@dataclass
class FakeEmbeddingProvider:
    vectors: list[list[float]] | None = None
    error: Exception | None = None
    batches: list[list[str]] = field(default_factory=list)

    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        self.batches.append(list(texts))
        if self.error is not None:
            raise self.error
        assert self.vectors is not None
        return self.vectors

    async def complete(self, *args, **kwargs):
        raise NotImplementedError

    async def stream(self, *args, **kwargs):
        raise NotImplementedError

    async def is_available(self) -> bool:
        return True

    def count_tokens(self, *args, **kwargs) -> int:
        return 0


class TestEmbeddingService:
    async def test_embeds_the_full_batch_in_a_single_call(self) -> None:
        ollama = FakeEmbeddingProvider(vectors=[[0.1, 0.2], [0.3, 0.4]])
        service = EmbeddingService({"ollama": ollama}, FALLBACK_CHAINS)

        result = await service.embed(["hello", "world"], model="nomic-embed-text")

        assert result == [[0.1, 0.2], [0.3, 0.4]]
        assert ollama.batches == [["hello", "world"]]  # exactly one call, not per-item

    async def test_empty_input_returns_empty_without_calling_the_provider(self) -> None:
        ollama = FakeEmbeddingProvider(vectors=[])
        service = EmbeddingService({"ollama": ollama}, FALLBACK_CHAINS)

        result = await service.embed([], model="nomic-embed-text")

        assert result == []
        assert ollama.batches == []

    async def test_walks_the_embedding_fallback_chain_when_no_model_is_given(self) -> None:
        ollama = FakeEmbeddingProvider(error=ModelUnavailableError("ollama down"))
        openai = FakeEmbeddingProvider(vectors=[[0.9]])
        service = EmbeddingService({"ollama": ollama, "openai": openai}, FALLBACK_CHAINS)

        result = await service.embed(["hi"])

        assert result == [[0.9]]
        assert openai.batches == [["hi"]]

    async def test_an_explicit_model_is_not_retried_on_failure(self) -> None:
        ollama = FakeEmbeddingProvider(error=ModelUnavailableError("ollama down"))
        service = EmbeddingService({"ollama": ollama}, FALLBACK_CHAINS)

        with pytest.raises(ModelUnavailableError):
            await service.embed(["hi"], model="nomic-embed-text")

    async def test_raises_when_no_embedding_provider_is_configured(self) -> None:
        service = EmbeddingService({}, {"embedding": []})

        with pytest.raises(ModelUnavailableError):
            await service.embed(["hi"])
