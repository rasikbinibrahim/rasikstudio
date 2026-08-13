# Playwright — Session Lifecycle Notes

Browser → BrowserContext → Page lifecycle and resource cleanup, and how this project's
`PlaywrightBrowserService` (`apps/backend/app/infrastructure/browser/playwright_service.py`)
actually implements it.

## Playwright's own hierarchy

```
Playwright (the driver connection)
 └─ Browser (a real browser process — Chromium/Firefox/WebKit)
     └─ BrowserContext (an isolated session — separate cookies/storage; "like an incognito window")
         └─ Page (a single tab)
```

Playwright's own docs recommend one `Browser`, many `BrowserContext`s (contexts are cheap to
create/destroy; a fresh `Browser` process is comparatively expensive) — the typical pattern for,
e.g., a test suite running many isolated test cases against one browser process.

## This project's actual hierarchy: one `Browser` per workspace, not per context

`phase-13-browser.md`'s architecture spec calls for **one full Playwright browser instance per
active workspace**, and `_get_page()` (`playwright_service.py:76`) implements exactly that — not
the more typical "one browser, many contexts" pattern. `_workspaces: dict[UUID, _WorkspaceBrowser]`
maps a workspace id directly to its own `Browser` (`_WorkspaceBrowser` bundles `browser`/`page`/
`last_used` together, `playwright_service.py:23`); `PROGRESS.md`'s Decisions Log names the
reasoning precisely: two different *workspaces'* agent tasks shouldn't be able to see each other's
browser state either — a stronger isolation guarantee than context-level separation would give,
since even Playwright-internal per-process state (extensions, some caching behavior) stays fully
separate per workspace, not just cookies/storage.

Within a workspace, only **one `Page`** is ever created (`browser.new_page()`, called once per
workspace the first time `_get_page()` runs for it) — no multi-tab support. A repeated call for
the same workspace reuses the existing page (`existing.last_used = time.monotonic(); return
existing.page`), so the agent's browsing state (whatever page it navigated to) persists across
multiple tool calls within the same task, which is the whole point: `browser_navigate` then
`browser_click` then `browser_get_text` need to act on the *same* page, not three independent
ones.

## Lazy start, not eager

`start()` (`playwright_service.py:53`) only starts the idle-sweep background task — `Playwright`
itself (the driver connection) and every per-workspace `Browser` stay unstarted until the first
real `navigate()` call (`_get_page()`'s `if self._playwright is None: self._playwright = await
async_playwright().start()`, checked lazily inside the method, not at service startup). Verified,
not assumed: `PROGRESS.md`'s Phase 13 entry states Playwright itself isn't touched until the first
real `navigate()` call, confirmed by direct testing.

## Cleanup, three paths

1. **Explicit close** (`close_workspace()`, `playwright_service.py:120`) — pops the workspace's
   entry and closes its `Browser`. Not currently wired to any real trigger (no code calls this
   today; it exists for a future "close browser session" feature, e.g. when a workspace is
   closed in the desktop app) — a real, honestly-named gap this analysis surfaces, not previously
   tracked in `TASKS.md`.
2. **Idle sweep** (`_sweep_loop()`/`_close_idle()`, `playwright_service.py:126-146`) — every
   `check_interval_seconds` (default 60s), closes any workspace `Browser` idle longer than
   `idle_timeout_seconds` (default 30 minutes). Both are constructor-injectable specifically so
   `test_playwright_service.py` can verify this with a real, short (sub-second) timeout rather
   than leaving it untested — the class's own docstring names this explicitly as *not* repeating
   the WebSocket gateway's untested-30s-timeout gap (Phase 7).
3. **Full service shutdown** (`stop()`, `playwright_service.py:62`) — cancels the sweep task,
   closes every remaining workspace `Browser`, and stops the `Playwright` driver connection itself
   — called from `core/events.py`'s `on_shutdown`, the same "long-lived singleton, started/stopped
   by app lifecycle" convention `browser_service`'s own trailing comment names
   (`playwright_service.py:150`, matching `infrastructure/ai/providers.py`'s `ai_providers` and
   `availability_checker.py`'s checker instance).

## No per-workspace concurrency limit

Already named in `TASKS.md`'s Phase 13 section, confirmed here: nothing caps how many workspaces
can have a browser open simultaneously — a resource-usage concern (each is a real Chromium
process), not a correctness bug, worth revisiting only if this becomes a real multi-tenant
concern.
