# apps/backend/app/infrastructure/browser/

Playwright headless browser for agent automation. Used only by agent browser tools — not for the interactive browser panel (that is an Electron `WebContentsView` in the desktop).

## Files (to be created in Phase 13)

| File | Purpose |
|---|---|
| `playwright_service.py` | `PlaywrightBrowserService` — browser lifecycle, navigation, screenshot, interaction |
| `ssrf_guard.py` | URL validation — blocks private IPs, link-local, and localhost before navigation |

## SSRF Protection (ssrf_guard.py)

The following are blocked from agent browser navigation:
- `http://localhost:*` and `http://127.0.0.1:*`
- `http://169.254.169.254` (AWS/GCP/Azure instance metadata)
- RFC 1918 private ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- Link-local: `169.254.0.0/16`, `fe80::/10`
- `file://` URLs

See `BROWSER_AUTOMATION.md §8` and Review Report §7.3.

## Instance Lifecycle

One Playwright browser per active workspace. Auto-closed after 30 minutes of inactivity. Resources released on workspace close.
