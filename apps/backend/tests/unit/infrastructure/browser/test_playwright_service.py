from __future__ import annotations

import asyncio
import base64
import socket
from unittest.mock import patch
from uuid import uuid4

import pytest

from app.infrastructure.browser.playwright_service import PlaywrightBrowserService
from app.infrastructure.browser.ssrf_guard import SSRFBlockedError

# These tests exercise `navigate()`'s real (non-mocked) SSRF-guard integration — that's the point
# of `test_ssrf_blocked_url_never_reaches_the_browser` below — but everything else here is meant
# to be a pure-logic test of `PlaywrightBrowserService` itself, so DNS resolution for the
# "public, safe" URLs used throughout is mocked rather than relying on real external DNS (which
# `test_ssrf_guard.py` already covers on its own, deliberately, against real address literals).
_PUBLIC_ADDRINFO = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]


@pytest.fixture(autouse=True)
def _mock_public_dns():
    with patch("socket.getaddrinfo", return_value=_PUBLIC_ADDRINFO):
        yield


class FakePage:
    def __init__(self) -> None:
        self.goto_calls: list[str] = []
        self.screenshot_calls = 0
        self.click_calls: list[str] = []
        self.fill_calls: list[tuple[str, str]] = []
        self.text_content_calls: list[str] = []

    async def goto(self, url: str, timeout: int | None = None, wait_until: str | None = None) -> None:
        self.goto_calls.append(url)

    async def screenshot(self, full_page: bool | None = None) -> bytes:
        self.screenshot_calls += 1
        return b"fake-png-bytes"

    async def click(self, selector: str, timeout: int | None = None) -> None:
        self.click_calls.append(selector)

    async def fill(self, selector: str, text: str, timeout: int | None = None) -> None:
        self.fill_calls.append((selector, text))

    async def text_content(self, selector: str, timeout: int | None = None) -> str:
        self.text_content_calls.append(selector)
        return "some text"


class FakeBrowser:
    def __init__(self) -> None:
        self.closed = False
        self.page = FakePage()

    async def new_page(self) -> FakePage:
        return self.page

    async def close(self) -> None:
        self.closed = True


class FakeChromium:
    def __init__(self) -> None:
        self.launched: list[FakeBrowser] = []

    async def launch(self, headless: bool = True) -> FakeBrowser:
        browser = FakeBrowser()
        self.launched.append(browser)
        return browser


class FakePlaywright:
    def __init__(self) -> None:
        self.chromium = FakeChromium()
        self.stopped = False

    async def stop(self) -> None:
        self.stopped = True


class FakePlaywrightContextManager:
    def __init__(self) -> None:
        self.playwright = FakePlaywright()
        self.start_calls = 0

    async def start(self) -> FakePlaywright:
        self.start_calls += 1
        return self.playwright


@pytest.fixture
def fake_playwright():
    fake_cm = FakePlaywrightContextManager()
    with patch(
        "app.infrastructure.browser.playwright_service.async_playwright", return_value=fake_cm
    ):
        yield fake_cm


class TestLazyStart:
    async def test_does_not_start_playwright_until_the_first_navigate(self, fake_playwright) -> None:
        service = PlaywrightBrowserService()

        assert fake_playwright.start_calls == 0

        await service.navigate(uuid4(), "https://example.com")

        assert fake_playwright.start_calls == 1
        await service.stop()

    async def test_start_only_launches_the_idle_sweep_not_a_browser(self, fake_playwright) -> None:
        service = PlaywrightBrowserService(check_interval_seconds=100)
        service.start()

        await asyncio.sleep(0)  # let the sweep task actually begin running
        assert fake_playwright.start_calls == 0
        assert len(fake_playwright.playwright.chromium.launched) == 0

        await service.stop()


class TestNavigate:
    async def test_ssrf_blocked_url_never_reaches_the_browser(self, fake_playwright) -> None:
        service = PlaywrightBrowserService()

        with pytest.raises(SSRFBlockedError):
            await service.navigate(uuid4(), "file:///etc/passwd")

        assert fake_playwright.start_calls == 0
        await service.stop()

    async def test_navigates_the_workspaces_page(self, fake_playwright) -> None:
        service = PlaywrightBrowserService()
        workspace_id = uuid4()

        await service.navigate(workspace_id, "https://example.com")

        browser = fake_playwright.playwright.chromium.launched[0]
        assert browser.page.goto_calls == ["https://example.com"]
        await service.stop()


class TestWorkspaceIsolation:
    async def test_two_workspaces_get_two_separate_browsers(self, fake_playwright) -> None:
        service = PlaywrightBrowserService()

        await service.navigate(uuid4(), "https://example.com")
        await service.navigate(uuid4(), "https://example.org")

        assert len(fake_playwright.playwright.chromium.launched) == 2
        await service.stop()

    async def test_the_same_workspace_reuses_its_browser_across_calls(self, fake_playwright) -> None:
        service = PlaywrightBrowserService()
        workspace_id = uuid4()

        await service.navigate(workspace_id, "https://example.com")
        await service.navigate(workspace_id, "https://example.org")

        assert len(fake_playwright.playwright.chromium.launched) == 1
        browser = fake_playwright.playwright.chromium.launched[0]
        assert browser.page.goto_calls == ["https://example.com", "https://example.org"]
        await service.stop()


class TestActions:
    async def test_screenshot_returns_base64_of_the_pngbytes(self, fake_playwright) -> None:
        service = PlaywrightBrowserService()
        workspace_id = uuid4()
        await service.navigate(workspace_id, "https://example.com")

        encoded = await service.screenshot(workspace_id)

        assert base64.b64decode(encoded) == b"fake-png-bytes"
        await service.stop()

    async def test_click_forwards_the_selector(self, fake_playwright) -> None:
        service = PlaywrightBrowserService()
        workspace_id = uuid4()
        await service.navigate(workspace_id, "https://example.com")

        await service.click(workspace_id, "#submit")

        browser = fake_playwright.playwright.chromium.launched[0]
        assert browser.page.click_calls == ["#submit"]
        await service.stop()

    async def test_type_text_forwards_selector_and_text(self, fake_playwright) -> None:
        service = PlaywrightBrowserService()
        workspace_id = uuid4()
        await service.navigate(workspace_id, "https://example.com")

        await service.type_text(workspace_id, "#email", "a@b.com")

        browser = fake_playwright.playwright.chromium.launched[0]
        assert browser.page.fill_calls == [("#email", "a@b.com")]
        await service.stop()

    async def test_get_text_returns_the_pages_text_content(self, fake_playwright) -> None:
        service = PlaywrightBrowserService()
        workspace_id = uuid4()
        await service.navigate(workspace_id, "https://example.com")

        result = await service.get_text(workspace_id, "h1")

        assert result == "some text"
        await service.stop()

    async def test_actions_lazily_start_a_browser_without_a_prior_navigate(self, fake_playwright) -> None:
        service = PlaywrightBrowserService()
        workspace_id = uuid4()

        await service.click(workspace_id, "#submit")

        assert len(fake_playwright.playwright.chromium.launched) == 1
        await service.stop()


class TestCloseWorkspace:
    async def test_closes_and_removes_the_workspaces_browser(self, fake_playwright) -> None:
        service = PlaywrightBrowserService()
        workspace_id = uuid4()
        await service.navigate(workspace_id, "https://example.com")
        browser = fake_playwright.playwright.chromium.launched[0]

        await service.close_workspace(workspace_id)

        assert browser.closed is True
        assert workspace_id not in service._workspaces
        await service.stop()

    async def test_is_a_no_op_for_a_workspace_that_was_never_opened(self, fake_playwright) -> None:
        service = PlaywrightBrowserService()

        await service.close_workspace(uuid4())  # does not raise

        await service.stop()


class TestIdleSweep:
    async def test_closes_a_browser_idle_past_the_configured_timeout(self, fake_playwright) -> None:
        # Real timing, deliberately tiny — this is exactly the kind of thing the WebSocket
        # gateway's own 30s idle timeout was left *untested* for in an earlier phase (real-time
        # wait too slow for a normal test run); making both timeouts constructor-injectable is
        # what makes verifying the real behavior practical here.
        service = PlaywrightBrowserService(idle_timeout_seconds=0.05, check_interval_seconds=0.02)
        workspace_id = uuid4()
        await service.navigate(workspace_id, "https://example.com")
        browser = fake_playwright.playwright.chromium.launched[0]
        service.start()

        await asyncio.sleep(0.2)

        assert browser.closed is True
        assert workspace_id not in service._workspaces
        await service.stop()

    async def test_does_not_close_a_browser_that_is_still_active(self, fake_playwright) -> None:
        service = PlaywrightBrowserService(idle_timeout_seconds=10, check_interval_seconds=0.02)
        workspace_id = uuid4()
        await service.navigate(workspace_id, "https://example.com")
        browser = fake_playwright.playwright.chromium.launched[0]
        service.start()

        await asyncio.sleep(0.1)

        assert browser.closed is False
        assert workspace_id in service._workspaces
        await service.stop()

    async def test_re_navigating_resets_the_idle_clock(self, fake_playwright) -> None:
        service = PlaywrightBrowserService(idle_timeout_seconds=0.1, check_interval_seconds=0.02)
        workspace_id = uuid4()
        await service.navigate(workspace_id, "https://example.com")
        browser = fake_playwright.playwright.chromium.launched[0]
        service.start()

        await asyncio.sleep(0.06)
        await service.navigate(workspace_id, "https://example.com/again")  # resets last_used
        await asyncio.sleep(0.06)

        assert browser.closed is False
        await service.stop()


class TestStop:
    async def test_closes_every_open_browser_and_stops_playwright(self, fake_playwright) -> None:
        service = PlaywrightBrowserService()
        await service.navigate(uuid4(), "https://example.com")
        await service.navigate(uuid4(), "https://example.org")

        await service.stop()

        assert all(b.closed for b in fake_playwright.playwright.chromium.launched)
        assert fake_playwright.playwright.stopped is True
        assert len(service._workspaces) == 0
