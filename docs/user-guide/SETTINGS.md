# Settings

`Ctrl+,` (or **Preferences: Open Settings** in the command palette) opens the Settings dialog.
Every field here writes to the same store/`localStorage` the rest of the app already reads from —
there's no separate settings system underneath the UI.

## Appearance

- **Theme** — Dark or Light. Applied immediately (real CSS custom-property swap on the document
  root), and persisted across restarts (applied before first paint, so there's no flash of the
  wrong theme on launch).

## Editor

- **Font size** — a number field, live-applied to the Monaco editor.
- **Word wrap** — on/off checkbox, live-applied.

## Backend

- **Backend URL** — where the desktop app looks for the FastAPI backend (default
  `http://127.0.0.1:8000`). Only relevant if you're running the backend somewhere other than
  localhost, or on a non-default port.

## Account

Sign-in isn't in this dialog — it's a separate action (**Account: Sign In** in the command
palette, or the status bar). Signing in is only required for backend-dependent features (AI
chat, agent tasks) — opening/editing files, git, and the terminal all work without ever signing
in, by design (this app is local-first — see the Decisions Log).

## What isn't built yet

Per-language editor settings, keybinding customization, and a settings-search box — the dialog is
a flat list of every setting that currently exists, not a searchable/categorized preferences
system.
