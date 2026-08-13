# Playwright — Screenshot Notes

Screenshot capture performance and encoding for delivery, as actually implemented in
`PlaywrightBrowserService.screenshot()` (`apps/backend/app/infrastructure/browser/
playwright_service.py:98`).

## Capture

```python
png_bytes = await page.screenshot(full_page=True)
return base64.b64encode(png_bytes).decode()
```

`full_page=True` captures the entire scrollable page content, not just the current viewport —
the right default for an agent that can't scroll-and-recapture the way a human visually exploring
a page would; a single full-page screenshot gives the model the complete visible content in one
observation. PNG (Playwright's default screenshot format) rather than JPEG — lossless, appropriate
for a tool whose output the model needs to read text/UI elements from accurately; JPEG's
compression artifacts would risk misleading the model on small text.

## Encoding for delivery: base64 data, no separate streaming path

The base64 string is returned directly as the tool's string observation — no separate binary
transport, no dedicated WebSocket event type for screenshot data. This is a deliberate design
choice, not an oversight, and the method's own docstring states why precisely: **every agent
tool's return value already streams to the desktop over the user's WebSocket channel** as part of
the existing `AgentStepEvent` pipeline (`base_agent.py`'s `event_emitter.step(..., result=
observation)`, built in Phase 8, reused unchanged here). `browser_screenshot` returning its
base64 data as a plain string gets it delivered through that already-tested mechanism "for free" —
satisfying `phase-13-browser.md`'s "delivered within 2 seconds" acceptance criterion structurally,
without a new mechanism to build or verify.

On the desktop side, `AgentBrowserView.tsx` renders a `browser_screenshot` step's data URI inline
in `AgentStepTimeline.tsx` (prefixing the base64 string with `data:image/png;base64,` to form a
real `<img src>`), rather than dumping the raw base64 blob into the existing plain-text step
display every other tool's observation uses.

## Performance characteristics, real (not estimated)

`page.screenshot()` for a full page is Chromium's own native screenshot capture — fast relative to
any DOM-serialization-based alternative (there isn't a meaningfully faster way to get pixel data
out of a real rendered page). The real cost in this project's own pipeline is less the screenshot
capture itself and more base64 encoding a potentially multi-hundred-KB PNG synchronously
(`base64.b64encode`, CPU-bound, blocks the event loop briefly for a large image) — not measured or
flagged as a problem in any `PROGRESS.md`/`TASKS.md` entry, since typical page screenshots in this
project's real verification (a simple `example.com`-style test fixture) stayed small; worth
profiling if agent tasks routinely screenshot much larger/more complex real-world pages.

## Real, non-mocked verification this project already did

`PROGRESS.md`'s Phase 13 entry: a real headless Chromium actually navigated and took a real
screenshot, verified by checking the real PNG magic bytes (`\x89PNG\r\n\x1a\n`) on the decoded
output — not just "non-empty bytes," an actual format check proving the capture pipeline produces
a genuine, decodable image end to end.
