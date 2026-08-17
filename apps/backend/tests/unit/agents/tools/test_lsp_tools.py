from __future__ import annotations

from unittest.mock import AsyncMock, patch

from app.agents.tools.lsp_tools import get_diagnostics
from app.infrastructure.lsp.client import LspClientError
from app.infrastructure.lsp.manager import UnsupportedLanguageError


class TestGetDiagnostics:
    async def test_reports_real_shaped_diagnostics_from_the_manager(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        (tmp_path / "bad.py").write_text("import os\n")

        with patch("app.agents.tools.lsp_tools.lsp_manager") as mock_manager:
            mock_manager.is_supported.return_value = True
            mock_manager.get_diagnostics = AsyncMock(
                return_value=[
                    {
                        "source": "pyflakes",
                        "severity": 2,
                        "range": {"start": {"line": 0, "character": 0}},
                        "message": "'os' imported but unused",
                    }
                ]
            )
            result = await get_diagnostics(path="bad.py", context=ctx)

        assert "1 diagnostic(s)" in result
        assert "warning at 1:1" in result
        assert "[pyflakes]" in result
        assert "'os' imported but unused" in result

    async def test_reports_no_diagnostics_for_a_clean_file(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        (tmp_path / "clean.py").write_text("x = 1\n")

        with patch("app.agents.tools.lsp_tools.lsp_manager") as mock_manager:
            mock_manager.is_supported.return_value = True
            mock_manager.get_diagnostics = AsyncMock(return_value=[])
            result = await get_diagnostics(path="clean.py", context=ctx)

        assert result == "No diagnostics found in clean.py"

    async def test_rejects_a_path_outside_the_workspace(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        result = await get_diagnostics(path="../outside.py", context=ctx)
        assert result.startswith("Error: Path outside workspace")

    async def test_reports_a_missing_file(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        result = await get_diagnostics(path="nope.py", context=ctx)
        assert result.startswith("Error: File not found")

    async def test_reports_an_unsupported_extension_without_reading_the_file(
        self, tmp_path, make_context
    ) -> None:
        ctx = make_context(tmp_path)
        (tmp_path / "index.ts").write_text("const x = 1;\n")

        with patch("app.agents.tools.lsp_tools.lsp_manager") as mock_manager:
            mock_manager.is_supported.return_value = False
            result = await get_diagnostics(path="index.ts", context=ctx)

        assert result.startswith("Error: No language server available")
        assert "only .py is supported" in result

    async def test_surfaces_an_unsupported_language_error_from_the_manager(
        self, tmp_path, make_context
    ) -> None:
        ctx = make_context(tmp_path)
        (tmp_path / "a.py").write_text("x = 1\n")

        with patch("app.agents.tools.lsp_tools.lsp_manager") as mock_manager:
            mock_manager.is_supported.return_value = True
            mock_manager.get_diagnostics = AsyncMock(side_effect=UnsupportedLanguageError("no server"))
            result = await get_diagnostics(path="a.py", context=ctx)

        assert result == "Error: no server"

    async def test_surfaces_an_lsp_client_error_eg_no_server_available_or_a_timeout(
        self, tmp_path, make_context
    ) -> None:
        ctx = make_context(tmp_path)
        (tmp_path / "a.py").write_text("x = 1\n")

        with patch("app.agents.tools.lsp_tools.lsp_manager") as mock_manager:
            mock_manager.is_supported.return_value = True
            mock_manager.get_diagnostics = AsyncMock(
                side_effect=LspClientError("Timed out waiting for diagnostics")
            )
            result = await get_diagnostics(path="a.py", context=ctx)

        assert result == "Error: Timed out waiting for diagnostics"
