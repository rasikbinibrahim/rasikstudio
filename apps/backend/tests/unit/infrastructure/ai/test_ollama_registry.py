from __future__ import annotations

import json

import httpx
import pytest

from app.core.errors import ModelUnavailableError
from app.infrastructure.ai.ollama_registry import OllamaRegistry


def _registry(handler) -> OllamaRegistry:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url="http://ollama-test")
    return OllamaRegistry("http://ollama-test", client=client)


class TestListModels:
    async def test_returns_the_installed_models(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.url.path == "/api/tags"
            return httpx.Response(
                200,
                json={
                    "models": [
                        {
                            "name": "qwen2.5-coder:1.5b",
                            "size": 986_000_000,
                            "modified_at": "2026-08-01T00:00:00Z",
                        },
                        {
                            "name": "nomic-embed-text",
                            "size": 274_000_000,
                            "modified_at": "2026-08-02T00:00:00Z",
                        },
                    ]
                },
            )

        models = await _registry(handler).list_models()

        assert [m.name for m in models] == ["qwen2.5-coder:1.5b", "nomic-embed-text"]
        assert models[0].size_bytes == 986_000_000
        assert models[0].modified_at == "2026-08-01T00:00:00Z"

    async def test_returns_an_empty_list_when_nothing_is_installed(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"models": []})

        models = await _registry(handler).list_models()

        assert models == []

    async def test_raises_model_unavailable_when_ollama_is_unreachable(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused")

        with pytest.raises(ModelUnavailableError):
            await _registry(handler).list_models()


class TestPullModel:
    async def test_yields_each_real_progress_line(self) -> None:
        lines = [
            {"status": "pulling manifest"},
            {"status": "downloading", "total": 1000, "completed": 500},
            {"status": "success"},
        ]

        def handler(request: httpx.Request) -> httpx.Response:
            assert request.url.path == "/api/pull"
            assert json.loads(request.content) == {"name": "qwen2.5-coder:1.5b"}
            body = "\n".join(json.dumps(line) for line in lines)
            return httpx.Response(200, content=body)

        progress = [p async for p in _registry(handler).pull_model("qwen2.5-coder:1.5b")]

        assert [p.status for p in progress] == ["pulling manifest", "downloading", "success"]
        assert progress[1].total == 1000
        assert progress[1].completed == 500
        assert all(p.error is None for p in progress)

    async def test_yields_an_error_line_rather_than_raising(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, content=json.dumps({"status": "error", "error": "model not found"}))

        progress = [p async for p in _registry(handler).pull_model("not-a-real-model")]

        assert progress[0].error == "model not found"

    async def test_raises_model_unavailable_when_ollama_is_unreachable(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused")

        with pytest.raises(ModelUnavailableError):
            async for _ in _registry(handler).pull_model("qwen2.5-coder:1.5b"):
                pass


class TestDeleteModel:
    async def test_sends_a_delete_request_with_the_model_name(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.method == "DELETE"
            assert request.url.path == "/api/delete"
            assert json.loads(request.content) == {"name": "qwen2.5-coder:1.5b"}
            return httpx.Response(200)

        await _registry(handler).delete_model("qwen2.5-coder:1.5b")

    async def test_raises_model_unavailable_when_ollama_is_unreachable(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("connection refused")

        with pytest.raises(ModelUnavailableError):
            await _registry(handler).delete_model("qwen2.5-coder:1.5b")
