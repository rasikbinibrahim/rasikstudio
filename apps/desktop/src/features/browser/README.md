# apps/desktop/src/features/browser/

In-IDE browser panel using Electron's `WebContentsView`. Provides interactive web browsing in a separate browser partition, isolated from the main renderer.

## Files (to be created in Phase 13)

| File | Purpose |
|---|---|
| `BrowserPanel.tsx` | Root panel: address bar, nav controls, WebContentsView container |
| `AddressBar.tsx` | URL input with loading indicator and navigation buttons |
| `BrowserToolbar.tsx` | Back, forward, reload, home buttons |
| `AgentBrowserOverlay.tsx` | Shows Playwright screenshots when the agent is using the browser |
| `useBrowser.ts` | Hook: navigation commands via IPC, page load state |

## Two Browser Contexts

1. **Interactive** (`BrowserPanel.tsx`) — `WebContentsView` in `persist:browser` partition. User browses manually. Has full browser UI (address bar, nav).
2. **Agent** (`AgentBrowserOverlay.tsx`) — Playwright in the FastAPI backend. No UI. Screenshots streamed via WebSocket as `agent_browser_screenshot` events.

Both render in this feature panel but on different tabs. They never share a browser session.

## Security

The interactive browser partition is isolated from the main renderer partition. It cannot access the main window's cookies, localStorage, or IndexedDB.
