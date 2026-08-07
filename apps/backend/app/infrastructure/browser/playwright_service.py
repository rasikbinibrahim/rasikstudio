from __future__ import annotations

import asyncio
import base64
import contextlib
import time
from dataclasses import dataclass
from uuid import UUID

import structlog
from playwright.async_api import Browser, Page, Playwright, async_playwright

from app.infrastructure.browser.ssrf_guard import validate_url_for_navigation

logger = structlog.get_logger("browser.playwright_service")

DEFAULT_IDLE_TIMEOUT_SECONDS = 30 * 60
DEFAULT_IDLE_CHECK_INTERVAL_SECONDS = 60
NAVIGATE_TIMEOUT_MS = 30_000
ACTION_TIMEOUT_MS = 10_000


@dataclass
class _WorkspaceBrowser:
    browser: Browser
    page: Page
    last_used: float


class PlaywrightBrowserService:
    """One headless Chromium instance per workspace (lazy-started on the first `navigate()`
    call), closed after `idle_timeout_seconds` of inactivity by a background sweep — per
    `phase-13-browser.md`'s architecture. This is the agent's *own* browser, entirely separate
    from the user's interactive `WebContentsView` panel (Electron main process, this phase's
    other half) — an agent action can never interfere with, or be confused with, something the
    user is doing in their own browser tab (ADR/Decisions Log: "Playwright headless for agent
    browser, not the interactive BrowserView"). `idle_timeout_seconds`/`check_interval_seconds`
    are constructor-injectable specifically so a test can verify real idle-closing behavior
    without waiting 30 real minutes — the WebSocket gateway's own 30s idle timeout was left
    untested for exactly this reason in an earlier phase; this one isn't repeating that gap."""

    def __init__(
        self,
        *,
        idle_timeout_seconds: float = DEFAULT_IDLE_TIMEOUT_SECONDS,
        check_interval_seconds: float = DEFAULT_IDLE_CHECK_INTERVAL_SECONDS,
    ) -> None:
        self._idle_timeout_seconds = idle_timeout_seconds
        self._check_interval_seconds = check_interval_seconds
        self._playwright: Playwright | None = None
        self._workspaces: dict[UUID, _WorkspaceBrowser] = {}
        self._lock = asyncio.Lock()
        self._sweep_task: asyncio.Task[None] | None = None
        self._stopped = asyncio.Event()

    def start(self) -> None:
        """Only starts the idle-sweep background task — Playwright itself and every per-workspace
        browser stay unstarted until the first real `navigate()` call, per the phase's own "lazy
        start" requirement. Mirrors `ProviderAvailabilityChecker.start()`'s lifecycle."""
        self._sweep_task = asyncio.create_task(self._sweep_loop())

    async def stop(self) -> None:
        self._stopped.set()
        if self._sweep_task is not None:
            self._sweep_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._sweep_task
        async with self._lock:
            for workspace_browser in self._workspaces.values():
                await workspace_browser.browser.close()
            self._workspaces.clear()
            if self._playwright is not None:
                await self._playwright.stop()
                self._playwright = None

    async def _get_page(self, workspace_id: UUID) -> Page:
        async with self._lock:
            if self._playwright is None:
                self._playwright = await async_playwright().start()

            existing = self._workspaces.get(workspace_id)
            if existing is not None:
                existing.last_used = time.monotonic()
                return existing.page

            browser = await self._playwright.chromium.launch(headless=True)
            page = await browser.new_page()
            self._workspaces[workspace_id] = _WorkspaceBrowser(
                browser=browser, page=page, last_used=time.monotonic()
            )
            return page

    async def navigate(self, workspace_id: UUID, url: str) -> None:
        """Raises `SSRFBlockedError` (checked *before* any browser/network activity, not as a
        response-time filter) or `playwright.async_api.Error` on a real navigation failure."""
        await validate_url_for_navigation(url)
        page = await self._get_page(workspace_id)
        await page.goto(url, timeout=NAVIGATE_TIMEOUT_MS, wait_until="domcontentloaded")

    async def screenshot(self, workspace_id: UUID) -> str:
        """Base64-encoded PNG — the tool result this backs (`browser_screenshot`) is what
        actually gets the image to the desktop: every tool result already streams over the
        user's WebSocket channel as part of the existing `AgentStepEvent` pipeline
        (`base_agent.py` emits `event_emitter.step(..., result=observation)` after every tool
        call), so no separate screenshot-specific event type or streaming path is needed."""
        page = await self._get_page(workspace_id)
        png_bytes = await page.screenshot(full_page=True)
        return base64.b64encode(png_bytes).decode()

    async def click(self, workspace_id: UUID, selector: str) -> None:
        page = await self._get_page(workspace_id)
        await page.click(selector, timeout=ACTION_TIMEOUT_MS)

    async def type_text(self, workspace_id: UUID, selector: str, text: str) -> None:
        page = await self._get_page(workspace_id)
        await page.fill(selector, text, timeout=ACTION_TIMEOUT_MS)

    async def get_text(self, workspace_id: UUID, selector: str) -> str:
        page = await self._get_page(workspace_id)
        content = await page.text_content(selector, timeout=ACTION_TIMEOUT_MS)
        return content or ""

    async def close_workspace(self, workspace_id: UUID) -> None:
        async with self._lock:
            workspace_browser = self._workspaces.pop(workspace_id, None)
        if workspace_browser is not None:
            await workspace_browser.browser.close()

    async def _sweep_loop(self) -> None:
        while not self._stopped.is_set():
            await self._close_idle()
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._stopped.wait(), timeout=self._check_interval_seconds)

    async def _close_idle(self) -> None:
        now = time.monotonic()
        async with self._lock:
            idle_ids = [
                workspace_id
                for workspace_id, workspace_browser in self._workspaces.items()
                if now - workspace_browser.last_used > self._idle_timeout_seconds
            ]
            idle_browsers = [self._workspaces.pop(workspace_id).browser for workspace_id in idle_ids]

        for browser in idle_browsers:
            logger.info("browser_closed_idle")
            with contextlib.suppress(Exception):
                await browser.close()


# Built once at import time, same "long-lived, own its own resources, started/stopped by
# core/events.py's on_startup/on_shutdown" convention as `infrastructure/ai/providers.py`'s
# `ai_providers` and `infrastructure/ai/availability_checker.py`'s checker instance.
browser_service = PlaywrightBrowserService()
