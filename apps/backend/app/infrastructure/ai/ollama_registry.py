from __future__ import annotations

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import httpx
import structlog

from app.core.errors import ModelUnavailableError

logger = structlog.get_logger("ai.ollama_registry")


@dataclass(frozen=True, slots=True)
class OllamaModelInfo:
    name: str
    size_bytes: int
    modified_at: str


@dataclass(frozen=True, slots=True)
class OllamaPullProgress:
    """One line of Ollama's `/api/pull` NDJSON stream. `total`/`completed` are `None` on the
    early status-only lines (e.g. `"pulling manifest"`) that precede any layer download — real
    Ollama output, not something this app synthesizes."""

    status: str
    total: int | None
    completed: int | None
    error: str | None = None


class OllamaRegistry:
    """Model *management* against a local (or self-hosted) Ollama server's HTTP API — list/pull/
    delete — kept separate from `OllamaProvider` (`ollama_provider.py`), which implements the
    `AIProvider` port (`complete`/`stream`/`embed`) for actually *using* an installed model.
    Conflating the two would mean every `AIProvider` implementation needing management methods
    that only Ollama actually has (OpenAI/Anthropic/Gemini models aren't something this app pulls
    or deletes), so this is its own small client instead, following the same constructor-injectable
    `httpx.AsyncClient` pattern `OllamaProvider` already established for testability.

    `docs/reference/ollama/ANALYSIS.md` §8 named the total absence of any desktop UI to manage
    Ollama models as a real, previously-untracked gap — a user had to already know to run the
    `ollama` CLI directly before this app's local-model chat/completion features had anything to
    talk to."""

    def __init__(self, base_url: str, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(base_url=base_url, timeout=None)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def list_models(self) -> list[OllamaModelInfo]:
        try:
            response = await self._client.get("/api/tags")
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ModelUnavailableError(f"Could not reach Ollama: {exc}") from exc
        body: dict[str, Any] = response.json()
        return [
            OllamaModelInfo(
                name=model["name"], size_bytes=model.get("size", 0), modified_at=model.get("modified_at", "")
            )
            for model in body.get("models", [])
        ]

    async def pull_model(self, name: str) -> AsyncIterator[OllamaPullProgress]:
        """Streams Ollama's own real download progress line by line — no synthetic percentage,
        no polling. A single `error` line (Ollama's own protocol for "this model doesn't exist" or
        a network failure mid-download) is yielded rather than raised, since it arrives as a
        normal element of the same stream everything else does; the API layer (`api/v1/models.py`)
        decides what a caller sees for it, not this client."""
        try:
            async with self._client.stream("POST", "/api/pull", json={"name": name}) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    data: dict[str, Any] = json.loads(line)
                    yield OllamaPullProgress(
                        status=data.get("status", ""),
                        total=data.get("total"),
                        completed=data.get("completed"),
                        error=data.get("error"),
                    )
        except httpx.HTTPError as exc:
            raise ModelUnavailableError(f"Could not reach Ollama: {exc}") from exc

    async def delete_model(self, name: str) -> None:
        try:
            response = await self._client.request("DELETE", "/api/delete", json={"name": name})
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ModelUnavailableError(f"Could not reach Ollama: {exc}") from exc
