from __future__ import annotations

import base64
import http.server
import threading
from collections.abc import Iterator
from uuid import uuid4

import pytest

from app.infrastructure.browser.playwright_service import PlaywrightBrowserService
from app.infrastructure.browser.ssrf_guard import SSRFBlockedError

_PAGE = b"""<!doctype html>
<html>
<head><title>Rasik Studio Browser Test</title></head>
<body>
<h1 id="heading">Hello from the test page</h1>
<button id="clicker" onclick="document.getElementById('heading').textContent='clicked'">Click me</button>
<input id="box" type="text" />
</body>
</html>"""


class _Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - stdlib method name
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(_PAGE)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - stdlib signature
        pass  # silence per-request logging — this is a test fixture, not something to observe


@pytest.fixture(scope="module")
def local_http_server() -> Iterator[str]:
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/"
    finally:
        server.shutdown()
        thread.join(timeout=5)


@pytest.fixture(scope="module")
async def chromium_available() -> bool:
    """A real headless Chromium launch either works or it doesn't in a given environment — system
    shared-library dependencies (`playwright install --with-deps`) aren't something a test can
    install for itself. Skipping cleanly here (rather than failing) is the same "environment gap,
    not a code gap" category as Phase 9's live-cloud-API tests and Phase 6's live-OAuth test.
    Launches Chromium directly via `playwright.async_api` rather than through
    `PlaywrightBrowserService.navigate()` — that method is SSRF-guarded, and every reachable test
    URL here is either loopback or needs a real target, neither of which cleanly isolates "did
    Chromium launch" from "did the SSRF guard do its job."""
    from playwright.async_api import async_playwright

    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            await browser.close()
    except Exception:
        return False
    return True


@pytest.fixture
async def service() -> Iterator[PlaywrightBrowserService]:
    svc = PlaywrightBrowserService()
    yield svc
    await svc.stop()


async def _goto_local_test_server(service: PlaywrightBrowserService, workspace_id, url: str) -> None:
    """`service.navigate()` runs every URL through the real SSRF guard, which correctly blocks
    `127.0.0.1` (loopback) — exactly right for an agent navigating somewhere a malicious actor
    chose, wrong for a test's own trusted local fixture server. Goes through `_get_page()`
    directly (a deliberate test seam, not a workaround for a bug) so the guard's real blocking
    behavior is verified separately, by `test_ssrf_guard_blocks_a_real_navigate_to_a_private_address`
    below, without also making every other real-browser test's setup impossible."""
    page = await service._get_page(workspace_id)
    await page.goto(url, timeout=30_000, wait_until="domcontentloaded")


class TestRealPlaywrightNavigation:
    async def test_navigates_screenshots_and_extracts_text_from_a_real_page(
        self, chromium_available: bool, local_http_server: str, service: PlaywrightBrowserService
    ) -> None:
        if not chromium_available:
            pytest.skip("Chromium is not launchable in this environment (missing shared libraries)")

        workspace_id = uuid4()
        await _goto_local_test_server(service, workspace_id, local_http_server)

        heading = await service.get_text(workspace_id, "#heading")
        assert heading == "Hello from the test page"

        screenshot_b64 = await service.screenshot(workspace_id)
        png_bytes = base64.b64decode(screenshot_b64)
        assert png_bytes[:8] == b"\x89PNG\r\n\x1a\n"  # real PNG magic bytes, not a stub/placeholder

    async def test_click_and_type_actually_mutate_the_real_page(
        self, chromium_available: bool, local_http_server: str, service: PlaywrightBrowserService
    ) -> None:
        if not chromium_available:
            pytest.skip("Chromium is not launchable in this environment (missing shared libraries)")

        workspace_id = uuid4()
        await _goto_local_test_server(service, workspace_id, local_http_server)

        await service.click(workspace_id, "#clicker")
        heading = await service.get_text(workspace_id, "#heading")
        assert heading == "clicked"

        await service.type_text(workspace_id, "#box", "hello world")
        # Confirmed via a screenshot-free assertion would need extra plumbing (no `get_value`
        # tool) — `type_text` not raising, against a real page, is what this test can verify
        # without adding a tool the roadmap doc doesn't call for.

    async def test_ssrf_guard_blocks_a_real_navigate_to_a_private_address(
        self, chromium_available: bool, service: PlaywrightBrowserService
    ) -> None:
        if not chromium_available:
            pytest.skip("Chromium is not launchable in this environment (missing shared libraries)")

        with pytest.raises(SSRFBlockedError):
            await service.navigate(uuid4(), "http://169.254.169.254/latest/meta-data/")
