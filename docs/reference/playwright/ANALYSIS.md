# Playwright — Reference Analysis

**Studied as of:** 2026-08-12. Playwright is a browser-automation library (Chromium/Firefox/
WebKit, one unified API) originally built by the former Puppeteer team at Microsoft. This is a
direct, shipped dependency of this project, not just a studied reference —
`apps/backend/app/infrastructure/browser/playwright_service.py` wraps it for the agent's headless
browsing tool set (`browser_navigate`/`browser_screenshot`/`browser_click`/`browser_type`/
`browser_get_text`, Phase 13).

## 1. Architecture

A driver-process model: Playwright's Python/Node/Java/.NET bindings all talk to real browser
binaries (Chromium/Firefox/WebKit, each Playwright's own patched/pinned build, not the system
browser) over the CDP-like protocol each browser exposes, through a Node.js driver process the
language binding spawns and communicates with. `async_playwright()` (Python's async API entry
point) starts that driver, and everything downstream — `Browser` → `BrowserContext` → `Page` — is
a real object graph mirroring an actual running browser's process/tab structure. This project's
`PlaywrightBrowserService` consumes exactly this three-level hierarchy (see
`SESSION_LIFECYCLE_NOTES.md`).

## 2. Folder Structure

Not directly relevant — consumed as a published package (`pip install playwright` +
`playwright install --with-deps chromium`), not vendored source.

## 3. Design Patterns

- **Auto-waiting** — every action (`page.click()`, `page.fill()`) automatically waits for the
  target element to be visible, stable (not mid-animation), and receiving-events before acting,
  rather than requiring the caller to insert explicit waits. This is why `PlaywrightBrowserService`
  doesn't implement its own retry/wait logic around `browser_click`/`browser_type` — Playwright's
  own auto-waiting already covers the common "element not ready yet" failure mode; this project's
  own `ACTION_TIMEOUT_MS = 10_000` (`playwright_service.py:19`) is the outer bound on how long
  that auto-waiting is allowed to keep trying before the tool call fails.
- **One `Browser` instance per isolation boundary the caller cares about** — `BrowserContext` is
  Playwright's own unit of isolation (separate cookies/storage/cache, closer to "an incognito
  window" than "a tab"); a `Browser` can host many contexts cheaply. `phase-13-browser.md`'s
  architecture spec (and this project's actual implementation) goes one level further than
  Playwright's own typical pattern: **one full `Browser` instance per workspace**, not just one
  context — see `SESSION_LIFECYCLE_NOTES.md` for why.
- **Injectable idle-timeout/check-interval as constructor parameters**
  (`PlaywrightBrowserService.__init__`) — not a Playwright pattern per se, but a real, deliberate
  design choice in this project's own wrapper specifically to make idle-closing behavior testable
  with a short, real timeout rather than left permanently unverified. The class's own docstring
  names exactly why: the WebSocket gateway's 30s idle timeout (Phase 7) was left untested for the
  same reason this class exists to avoid repeating (`playwright_service.py:29-38`).

## 4. Dependencies

The Python `playwright` package plus the browser binaries it manages (`playwright install
--with-deps chromium` — this project only installs Chromium, not Firefox/WebKit, since the agent
tool set only ever needs one consistent rendering engine, not cross-browser testing). This
project's `apps/backend/Dockerfile` runs that install step, adding real, measurable size/build-
time to the backend image (`TASKS.md`, Phase 13 section: "not measured precisely, worth keeping
an eye on").

## 5. Build Process

Not applicable to this project's own build beyond the Dockerfile step above — Playwright itself
ships pre-built browser binaries per platform, downloaded (or, per this project's Dockerfile,
installed with system library dependencies via `--with-deps`) rather than compiled.

## 6. Features

Screenshot capture (PNG/JPEG, full-page or viewport, this project uses viewport PNG — see
`SCREENSHOT_NOTES.md`), network interception/mocking (unused here — the agent's browsing is real,
unmocked navigation), tracing/video recording (unused — this project's own observability for
agent browser actions is the `AgentStepEvent` pipeline, not Playwright's own trace viewer),
mobile-device emulation (unused — no responsive-testing use case here), and a codegen/inspector
tool for interactively recording scripts (irrelevant to this project's programmatic-only usage).

## 7. Strengths

- Auto-waiting (§3) genuinely eliminates an entire category of flaky-automation bugs relative to
  older tools (Selenium-era explicit-wait patterns) — directly why `PlaywrightBrowserService`'s
  own tool implementations stay simple (no custom retry loops).
- One unified API across three browser engines, even though this project only uses one — reduces
  the conceptual surface area a developer extending this project's browser tools needs to learn,
  since Playwright's Chromium API is representative of its Firefox/WebKit APIs too.
- Genuinely fast, real headless execution — this project's own real-Chromium integration tests
  (`test_playwright_service_integration.py`, verified against a real local `http.server` fixture,
  not mocked) run in seconds, not minutes.

## 8. Weaknesses

- Real browser binaries are a heavy dependency (§4) — Docker image size/build-time cost, and this
  sandboxed dev environment specifically lacked several shared libraries Chromium needs
  (`libnspr4`/`libnss3`/`libasound2`), requiring a real, documented workaround
  (`apt-get download` without root + `dpkg-deb -x` extraction + `LD_LIBRARY_PATH`) to verify
  locally — a genuine friction point for any sandboxed/minimal-container development environment,
  not unique to this project.
- No built-in SSRF protection — Playwright will happily navigate to a cloud metadata endpoint or
  an internal service if told to; this project's own `ssrf_guard.py` (DNS-resolved-address
  validation before any navigation, both IPv4 and IPv6) is entirely this project's own
  responsibility to build, not something Playwright provides.

## 9. Reusable Modules

The whole package is used directly as a dependency (see §4), not "reused" in the copy-source
sense. No Playwright source lives in this repository.

## 10. Modules That Should Be Rewritten

Not applicable — consumed as a published package.

## 11. License Requirements

See `LICENSE_NOTES.md`.
