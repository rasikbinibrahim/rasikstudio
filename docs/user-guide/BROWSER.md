# Browser

`Ctrl+Shift+B` (or the Activity Bar's Browser icon) opens an interactive, real Chromium browser
panel embedded in the IDE — an address bar, back/forward/reload, and a real rendered page, useful
for checking a locally-running dev server without leaving the editor.

This is a genuinely separate browser instance from the one AI agents use for their own `browser_*`
tool calls (navigate/screenshot/click/type/get-text) — the two can't interfere with each other,
by design (see the root `BROWSER_AUTOMATION.md` and ADR-adjacent Decisions Log entry on this
separation).

## Agent browser use

When an agent task uses a browser tool, its actions and screenshots appear inline in that task's
step timeline in the Agent Tasks panel (see `AI_FEATURES.md`) — not in this interactive Browser
panel. The agent's browser runs headless, isolated per workspace, with basic SSRF protection
(private/internal network addresses are blocked before any request is made).

## What isn't built yet

Multiple tabs, bookmarks, and browsing history in the interactive panel — it's a single-page
utility view today, not a full secondary browser.
