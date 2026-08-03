# Browser Automation — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03

---

## 1. Overview

The browser panel embeds a controllable web browser inside the IDE. It serves two purposes:

1. **User browsing:** A built-in browser for quickly referencing documentation, testing web apps, or researching.
2. **Agent automation:** AI agents can programmatically navigate, click, type, and read the browser to complete web-based tasks (e.g., filling out forms, reading documentation, testing a deployed web app).

---

## 2. Architecture

```
Browser Panel (React UI)
    │  IPC: navigate, screenshot, controls
    │
    ▼
Electron Main Process (browser.ipc.ts)
    │
    ├──► BrowserView / WebContentsView
    │      (embedded Chromium, for user interaction)
    │
    └──► Playwright Backend (FastAPI service)
           (headless Chromium, for agent automation)
```

Two browser contexts:
- **Interactive BrowserView:** User can browse manually in the panel. Limited agent control (screenshot + inject JS).
- **Headless Playwright browser:** Full agent control. Not visible to the user but screenshots are streamed to the panel for observation.

---

## 3. Interactive Browser Panel

The browser panel renders inside a dedicated panel using Electron's `WebContentsView`:

```typescript
// electron/main.ts

const browserView = new WebContentsView({
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    partition: 'persist:browser',   // separate session from main app
  },
});

browserView.webContents.loadURL('about:blank');
mainWindow.contentView.addChildView(browserView);
```

The view position and size is managed by the IPC layer, synced to the React panel's layout.

### Navigation Controls (UI)

```
┌─────────────────────────────────────────────────────────────┐
│ ← → ↺  [https://docs.example.com/api           ]  [AI] [⊕] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    Browser Content                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

- `←` Back, `→` Forward, `↺` Reload
- Address bar with URL input and navigation
- `[AI]` button: "Ask AI about this page" (sends page content + screenshot to chat)
- `[⊕]` button: open in external browser

---

## 4. Playwright Integration

The backend runs a Playwright service for agent-controlled browsing:

```python
# app/infrastructure/tools/browser_tool.py

class PlaywrightBrowserService:
    def __init__(self):
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._page: Page | None = None

    async def start(self):
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox"],
        )
        context = await self._browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (compatible; RasikStudio/1.0)",
        )
        self._page = await context.new_page()

    async def navigate(self, url: str) -> str:
        await self._page.goto(url, wait_until="networkidle", timeout=30_000)
        return self._page.url

    async def screenshot(self) -> bytes:
        return await self._page.screenshot(type="png", full_page=False)

    async def click(self, selector: str) -> None:
        await self._page.click(selector, timeout=10_000)

    async def type_text(self, selector: str, text: str) -> None:
        await self._page.fill(selector, text)

    async def get_text(self) -> str:
        return await self._page.inner_text("body")

    async def get_html(self) -> str:
        return await self._page.content()

    async def execute_js(self, script: str) -> object:
        return await self._page.evaluate(script)

    async def close(self):
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()
```

---

## 5. Agent Browser Tools

The Playwright service is exposed to agents through these tools:

```python
@tool(name="browser_navigate")
async def browser_navigate(url: str, context: AgentContext) -> str:
    """Navigate the browser to a URL. Returns the final URL after redirects."""
    svc = await get_browser_service(context.workspace_id)
    final_url = await svc.navigate(url)
    return f"Navigated to: {final_url}"

@tool(name="browser_screenshot")
async def browser_screenshot(context: AgentContext) -> str:
    """Capture a screenshot of the current browser page. Returns base64 PNG."""
    svc = await get_browser_service(context.workspace_id)
    png_bytes = await svc.screenshot()
    b64 = base64.b64encode(png_bytes).decode()
    # Also emit as WebSocket event so the user can see it in the panel
    await context.event_emitter.emit({
        "type": "browser_screenshot",
        "task_id": str(context.task_id),
        "image": b64,
    })
    return f"data:image/png;base64,{b64}"

@tool(name="browser_click")
async def browser_click(selector: str, context: AgentContext) -> str:
    """Click an element identified by a CSS selector or text."""
    svc = await get_browser_service(context.workspace_id)
    await svc.click(selector)
    return f"Clicked: {selector}"

@tool(name="browser_type")
async def browser_type(selector: str, text: str, context: AgentContext) -> str:
    """Type text into an input field."""
    svc = await get_browser_service(context.workspace_id)
    await svc.type_text(selector, text)
    return f"Typed into: {selector}"

@tool(name="browser_get_text")
async def browser_get_text(context: AgentContext) -> str:
    """Get the visible text content of the current page."""
    svc = await get_browser_service(context.workspace_id)
    text = await svc.get_text()
    return text[:10_000]  # cap at 10K chars for context window safety
```

---

## 6. Screenshot Streaming to UI

When an agent takes a screenshot, the base64 PNG is sent over WebSocket to the frontend and displayed in the browser panel's "Agent View" tab:

```
Agent Panel (Task Timeline)
    → Step: browser_screenshot
    → shows thumbnail of screenshot inline in the step
    
Browser Panel
    → "Agent View" tab shows the live agent browser
    → Updates with each screenshot event
```

This gives the user visibility into what the agent is doing without interrupting them.

---

## 7. "Ask AI about this page" Feature

The `[AI]` button in the browser toolbar:
1. Captures a screenshot via `webContents.capturePage()`.
2. Extracts the page's `document.body.innerText` via `executeJavaScript`.
3. Sends both to the AI chat with the prompt:
   ```
   The user is viewing: {url}
   
   Page text content:
   {page_text}
   
   [Attached: screenshot]
   
   User question: {user_input}
   ```
4. Opens the chat panel if not already visible.

---

## 8. Security

- The interactive `WebContentsView` uses a separate Chromium partition (`persist:browser`) with no access to the main app's storage or Node.js APIs.
- Playwright runs in a separate process, sandboxed from the main Electron process.
- Agent browser tools are gated by the `network.browse` permission.
- Agents cannot access the interactive browser session's cookies or local storage.
- Navigation to `file://` URLs is blocked in the agent browser (prevents workspace data exfiltration via browser).

---

## 9. Browser Session Management

- One Playwright browser instance per active workspace.
- Browser instances are lazily created when first needed.
- Idle instances are destroyed after 30 minutes of inactivity.
- Users can manually close the browser instance from the panel header.

---

## 10. Supported Use Cases

| Use Case | Mechanism |
|---|---|
| View deployed web app | Interactive BrowserView |
| Test frontend UI manually | Interactive BrowserView |
| Agent fills a web form | Playwright tools |
| Agent reads documentation | Playwright tools + `browser_get_text` |
| Agent runs E2E-style checks | Playwright tools |
| Research / reference lookup | Interactive BrowserView |
| AI explains a web page | "Ask AI" button → chat |
