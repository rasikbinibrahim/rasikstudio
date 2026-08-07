from __future__ import annotations

from dataclasses import dataclass

from app.agents.tools import search_tools
from app.agents.tools.search_tools import grep, search_files, search_semantic
from app.domain.ports.vector_store import VectorSearchResult


class TestSearchFiles:
    async def test_finds_matching_files(self, tmp_path, make_context) -> None:
        (tmp_path / "a.py").write_text("x")
        (tmp_path / "sub").mkdir()
        (tmp_path / "sub" / "b.py").write_text("x")
        (tmp_path / "c.txt").write_text("x")
        ctx = make_context(tmp_path)

        result = await search_files(pattern="**/*.py", context=ctx)

        assert "a.py" in result
        assert "sub/b.py" in result
        assert "c.txt" not in result

    async def test_excludes_conventional_ignored_directories(self, tmp_path, make_context) -> None:
        (tmp_path / "node_modules").mkdir()
        (tmp_path / "node_modules" / "ignored.py").write_text("x")
        (tmp_path / "real.py").write_text("x")
        ctx = make_context(tmp_path)

        result = await search_files(pattern="**/*.py", context=ctx)

        assert "real.py" in result
        assert "ignored.py" not in result

    async def test_no_matches(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        assert await search_files(pattern="**/*.nonexistent", context=ctx) == "(no matches)"


class TestGrep:
    async def test_finds_a_matching_line(self, tmp_path, make_context) -> None:
        (tmp_path / "a.py").write_text("def hello():\n    return 1\n")
        ctx = make_context(tmp_path)

        result = await grep(pattern="hello", context=ctx)

        assert "a.py:1:def hello():" in result

    async def test_no_matches(self, tmp_path, make_context) -> None:
        (tmp_path / "a.py").write_text("nothing interesting\n")
        ctx = make_context(tmp_path)
        assert await grep(pattern="not-present-anywhere", context=ctx) == "(no matches)"

    async def test_excludes_conventional_ignored_directories(self, tmp_path, make_context) -> None:
        (tmp_path / "node_modules").mkdir()
        (tmp_path / "node_modules" / "a.py").write_text("needle")
        (tmp_path / "real.py").write_text("needle")
        ctx = make_context(tmp_path)

        result = await grep(pattern="needle", context=ctx)

        assert "real.py" in result
        assert "node_modules" not in result

    async def test_refuses_a_path_traversal_attempt(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        result = await grep(pattern="x", context=ctx, path="../../etc")
        assert result.startswith("Error: Path outside workspace")


@dataclass
class FakeEmbeddingService:
    vectors: list[list[float]]

    async def embed(self, texts, model=None):
        return self.vectors


class FakeEmbeddingRepository:
    def __init__(self, results: list[VectorSearchResult]) -> None:
        self._results = results

    async def search(self, *, workspace_id, query_embedding, top_k=5):
        return self._results


class TestSearchSemantic:
    async def test_returns_indexed_results(self, tmp_path, make_context, monkeypatch) -> None:
        results = [
            VectorSearchResult(
                id=__import__("uuid").uuid4(),
                content="def hello(): ...",
                distance=0.12,
                metadata={"file_path": "a.py"},
            )
        ]
        monkeypatch.setattr(
            search_tools, "EmbeddingService", lambda *a, **k: FakeEmbeddingService([[0.1, 0.2]])
        )

        class FakeSession:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

        monkeypatch.setattr(search_tools, "AsyncSessionLocal", lambda: FakeSession())
        monkeypatch.setattr(
            search_tools, "EmbeddingRepository", lambda session: FakeEmbeddingRepository(results)
        )

        ctx = make_context(tmp_path)
        result = await search_semantic(query="hello function", context=ctx)

        assert "a.py" in result
        assert "def hello" in result

    async def test_no_indexed_results_is_not_an_error(self, tmp_path, make_context, monkeypatch) -> None:
        monkeypatch.setattr(
            search_tools, "EmbeddingService", lambda *a, **k: FakeEmbeddingService([[0.1, 0.2]])
        )

        class FakeSession:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

        monkeypatch.setattr(search_tools, "AsyncSessionLocal", lambda: FakeSession())
        monkeypatch.setattr(search_tools, "EmbeddingRepository", lambda session: FakeEmbeddingRepository([]))

        ctx = make_context(tmp_path)
        result = await search_semantic(query="anything", context=ctx)

        assert "not be indexed yet" in result
