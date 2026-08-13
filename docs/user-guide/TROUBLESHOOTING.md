# Troubleshooting

## AI chat / agent tasks fail immediately

Both need either a running local Ollama server with a pulled model, or a cloud provider API key
configured in Settings. Check:

- Is Ollama actually running? (`ollama list` in a terminal should show at least one model.)
- If using a cloud provider, is the API key entered correctly in Settings, and does it have
  quota/billing set up on the provider's side?
- Is the backend itself reachable? (See "Backend connection issues" below.)

## Backend connection issues

Chat, agent tasks, and AI commit-message generation all need the FastAPI backend running and
reachable at the URL configured in **Settings → Backend** (default `http://127.0.0.1:8000`).
Editing files, git, and the terminal do **not** need the backend — those work entirely locally.
If only the AI-dependent features are broken, this is almost always a backend connectivity issue,
not an app bug:

- Is the backend actually running? (`make dev` starts it alongside the desktop app.)
- Are Postgres and Redis running? (`docker compose ps` should show both healthy — `make infra-up`
  if not.)

## Terminal doesn't open / shows an error

The terminal needs a workspace open first (it starts a shell rooted at your workspace folder) —
if no folder is open, `` Ctrl+` `` won't have anywhere to start a shell.

## Hover / go-to-definition doesn't work in a file

Language-server support currently covers TypeScript, JavaScript, Python, and JSON only. For
Python specifically, the language server needs `pylsp` or `uv` available on your system `PATH` —
if neither is present, Python language features are silently unavailable (by design, not a
crash) rather than blocking the rest of the app.

## The app won't launch at all (Linux)

If you built from source and see an error about a missing shared library (e.g. `libnspr4.so`),
your system is missing NSS/ALSA libraries Electron's bundled Chromium needs — install them via
your distro's package manager (`libnspr4`, `libnss3`, `libasound2` on Debian/Ubuntu-based
systems). This is a genuinely uncommon situation on a normal desktop Linux install; it mainly
came up while building/testing this project inside a minimal container.

## Git panel shows nothing / "Not a git repository"

The Git panel only shows anything once your open workspace folder is (or is inside) a real git
repository — `git init` it first if it isn't one yet.

## Still stuck?

Check `CHANGELOG.md` for what's actually shipped and `TASKS.md` for known, already-tracked gaps —
a feature that "doesn't work" may be one that's honestly documented as not built yet rather than
broken. If neither explains what you're seeing, it's a real bug — please report it with the
`request_id` from any error response if one was shown (see `docs/api/ERROR_CODES.md`).
