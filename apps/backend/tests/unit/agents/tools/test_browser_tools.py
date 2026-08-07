from __future__ import annotations

from unittest.mock import AsyncMock, patch

from app.agents.tools.browser_tools import (
    browser_click,
    browser_get_text,
    browser_navigate,
    browser_screenshot,
    browser_type,
)
from app.infrastructure.browser.ssrf_guard import SSRFBlockedError


class TestBrowserNavigate:
    async def test_navigates_and_reports_success(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        with patch("app.agents.tools.browser_tools.browser_service") as mock_service:
            mock_service.navigate = AsyncMock()
            result = await browser_navigate(url="https://example.com", context=ctx)

        mock_service.navigate.assert_awaited_once_with(ctx.workspace_id, "https://example.com")
        assert "example.com" in result

    async def test_surfaces_an_ssrf_block_as_an_error_string(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        with patch("app.agents.tools.browser_tools.browser_service") as mock_service:
            mock_service.navigate = AsyncMock(side_effect=SSRFBlockedError("blocked address: 10.0.0.1"))
            result = await browser_navigate(url="http://10.0.0.1", context=ctx)

        assert result.startswith("Error:")
        assert "blocked address" in result

    async def test_surfaces_a_navigation_failure_as_an_error_string(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        with patch("app.agents.tools.browser_tools.browser_service") as mock_service:
            mock_service.navigate = AsyncMock(side_effect=RuntimeError("timeout"))
            result = await browser_navigate(url="https://example.com", context=ctx)

        assert result.startswith("Error:")


class TestBrowserScreenshot:
    async def test_returns_a_base64_png_data_uri(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        with patch("app.agents.tools.browser_tools.browser_service") as mock_service:
            mock_service.screenshot = AsyncMock(return_value="aGVsbG8=")
            result = await browser_screenshot(context=ctx)

        assert result == "data:image/png;base64,aGVsbG8="

    async def test_surfaces_a_screenshot_failure_as_an_error_string(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        with patch("app.agents.tools.browser_tools.browser_service") as mock_service:
            mock_service.screenshot = AsyncMock(side_effect=RuntimeError("no page"))
            result = await browser_screenshot(context=ctx)

        assert result.startswith("Error:")


class TestBrowserClick:
    async def test_clicks_and_reports_success(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        with patch("app.agents.tools.browser_tools.browser_service") as mock_service:
            mock_service.click = AsyncMock()
            result = await browser_click(selector="#submit", context=ctx)

        mock_service.click.assert_awaited_once_with(ctx.workspace_id, "#submit")
        assert "#submit" in result

    async def test_surfaces_a_click_failure_as_an_error_string(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        with patch("app.agents.tools.browser_tools.browser_service") as mock_service:
            mock_service.click = AsyncMock(side_effect=RuntimeError("no such element"))
            result = await browser_click(selector="#missing", context=ctx)

        assert result.startswith("Error:")


class TestBrowserType:
    async def test_types_and_reports_success(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        with patch("app.agents.tools.browser_tools.browser_service") as mock_service:
            mock_service.type_text = AsyncMock()
            result = await browser_type(selector="#email", text="a@b.com", context=ctx)

        mock_service.type_text.assert_awaited_once_with(ctx.workspace_id, "#email", "a@b.com")
        assert "#email" in result


class TestBrowserGetText:
    async def test_returns_the_extracted_text(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        with patch("app.agents.tools.browser_tools.browser_service") as mock_service:
            mock_service.get_text = AsyncMock(return_value="Hello world")
            result = await browser_get_text(selector="h1", context=ctx)

        assert result == "Hello world"

    async def test_surfaces_a_get_text_failure_as_an_error_string(self, tmp_path, make_context) -> None:
        ctx = make_context(tmp_path)
        with patch("app.agents.tools.browser_tools.browser_service") as mock_service:
            mock_service.get_text = AsyncMock(side_effect=RuntimeError("no such element"))
            result = await browser_get_text(selector="h1", context=ctx)

        assert result.startswith("Error:")
