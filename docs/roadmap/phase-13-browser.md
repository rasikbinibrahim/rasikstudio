# Phase 13 — Browser

**Part of:** [Implementation Roadmap](README.md)
**Depends on:** Phase 10 (for "Ask AI" feature)
**Estimated effort:** 2 weeks

---

## Objective

Integrate two browser contexts: an interactive `WebContentsView` for browsing within the IDE, and a headless Playwright browser for agent automation. By the end of this phase, users can browse the web in a panel, and agents can navigate, screenshot, and interact with web pages.

## Architecture

**Two contexts:**
1. **Interactive browser** — Electron `WebContentsView` in a separate `persist:browser` session partition. Rendered in a browser panel. User navigates normally.
2. **Agent browser** — Playwright running in the FastAPI backend. No visible UI. Screenshots streamed via WebSocket to the desktop as base64 PNG.

**PlaywrightBrowserService (backend):**
- One Playwright browser instance per active workspace (lazy start)
- 30-minute idle timeout → browser closed and resources freed
- SSRF protection: block navigation to private IP ranges and link-local addresses
- Screenshot: full page → base64 → WebSocket event → desktop renders in Agent panel

**Agent browser tools:**
- `browser_navigate(url)` — navigate (SSRF checked)
- `browser_screenshot()` — returns base64 PNG
- `browser_click(selector)` — click element by CSS selector
- `browser_type(selector, text)` — type into input
- `browser_get_text(selector)` — extract text content

## Dependencies

- Phase 3 complete (Electron, WebContentsView API)
- Phase 8 complete (browser tools already listed in the tool registry)
- Phase 7 complete (WebSocket for screenshot streaming)
- `playwright` Python package (backend)
- Playwright browser binaries (installed separately: `playwright install chromium`)

## Files to Create

**Electron main:**
- `electron/main/browser-view.ts` — `BrowserViewManager` (WebContentsView lifecycle, navigation controls)
- `electron/main/ipc/browser-handlers.ts`

**Backend:**
- `app/infrastructure/browser/playwright_service.py` — `PlaywrightBrowserService`
- `app/infrastructure/browser/ssrf_guard.py` — SSRF protection (private IP blocklist)

**Desktop renderer:**
- `src/features/browser/BrowserPanel.tsx` — address bar, navigation controls, WebContentsView container
- `src/features/browser/AgentBrowserView.tsx` — screenshot stream display

## Files to Modify

- `electron/main/window-manager.ts` — attach WebContentsView to BrowserWindow
- `src/layout/LeftSidebar.tsx` or `RightSidebar.tsx` — add Browser panel tab
- `app/agents/tools/browser_tools.py` — connect to `PlaywrightBrowserService`

## Acceptance Criteria

- [ ] Browser panel shows a working web browser (loads a URL)
- [ ] Address bar shows current URL, back/forward buttons work
- [ ] Agent `browser_navigate("https://example.com")` navigates headless Playwright
- [ ] Agent `browser_screenshot()` returns a valid base64 PNG
- [ ] Screenshot delivered to desktop via WebSocket within 2 seconds
- [ ] SSRF: `browser_navigate("http://169.254.169.254")` returns error, does not make request
- [ ] SSRF: `browser_navigate("http://localhost:5432")` blocked
- [ ] Playwright browser is closed after 30 minutes of agent inactivity
- [ ] Interactive browser uses separate session partition (`persist:browser`)

## Testing Strategy

- **Unit tests:** SSRF guard (all private IP ranges blocked, public IPs allowed)
- **Integration tests:** Playwright navigates to a local HTTP server, takes screenshot, text extracted correctly
- **Manual:** Load a complex page (documentation site), verify rendering

## Estimated Effort

**2 weeks**
- Week 1: Interactive WebContentsView browser panel
- Week 2: Playwright backend service, SSRF guard, agent tool connections, screenshot streaming
