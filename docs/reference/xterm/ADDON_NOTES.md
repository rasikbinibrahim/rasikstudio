# xterm.js — Addon Notes

`FitAddon`, `Unicode11Addon`, `SearchAddon` — setup and usage, as actually wired in
`apps/desktop/src/features/terminal/useTerminal.ts`. (`WebglAddon` has its own dedicated
`WEBGL_SETUP_NOTES.md`.)

## `FitAddon`

```ts
const fitAddon = new FitAddon()
term.loadAddon(fitAddon)
// ...
fitAddon.fit()
```

Resizes the terminal's own row/column count to fill its DOM container — xterm.js has no built-in
"size to container" behavior; without this addon a terminal stays at whatever fixed size it was
created with regardless of the panel it's rendered in. This project calls `fitAddon.fit()` twice:
once right after `term.open()` (initial sizing) and once inside a `ResizeObserver` callback
(`useTerminal.ts`'s trailing `resizeObserver.observe(container)`) so the terminal re-fits whenever
its container's size actually changes (the bottom panel being resized, the window itself being
resized). Each re-fit is followed by `window.rasik.terminal.resize(terminalId, term.cols, term.
rows)` — telling the real PTY process (via `node-pty`, main process) its new dimensions, since a
shell/program needs to know the real terminal size to wrap output/redraw full-screen UIs (`vim`,
`htop`) correctly. Without this second step, xterm.js's own display would resize but the actual
running process would keep assuming its old dimensions — a real, easy-to-miss bug this project's
implementation avoids by always pairing a `fit()` call with a `resize()` IPC call.

## `Unicode11Addon`

```ts
term.loadAddon(new Unicode11Addon())
term.unicode.activeVersion = '11'
```

xterm.js ships Unicode 6 grapheme-width handling by default (character-width calculation for
wide/combining characters), which mishandles many modern emoji and combining-character sequences.
The Unicode 11 addon provides more accurate width calculation matching a newer Unicode revision —
loading the addon alone isn't enough; `term.unicode.activeVersion` must also be set to `'11'` to
actually select it (xterm.js supports having multiple Unicode-version providers loaded
simultaneously and switching between them, though this project only ever loads one and switches to
it immediately). Two-step setup, both present in this project's real code — a common integration
mistake is loading the addon but forgetting the second line, which silently leaves the terminal
on Unicode 6 width calculations.

## `SearchAddon`

```ts
term.loadAddon(new SearchAddon())
```

Loaded but not currently wired to any UI in this project — no "search in terminal" keybinding or
UI surface exists yet (`Ctrl+F`-in-terminal, matching this app's own command-palette/quick-open
conventions, would be the natural trigger). A real, previously-untracked gap this analysis
surfaces: the addon's own scrollback-search capability is available and loaded, just unreachable
from the UI today — worth a `TASKS.md` follow-up if in-terminal search becomes a real user ask.

## Load order

All addons except `WebglAddon` are loaded before `term.open(container)`; `WebglAddon` is loaded
after, since (per `WEBGL_SETUP_NOTES.md`) it needs the terminal already attached to a real DOM
element to acquire a rendering context. `FitAddon`/`SearchAddon`/`Unicode11Addon` have no such
requirement and could be loaded either before or after `open()` — this project loads them before,
which is also the order xterm.js's own documentation examples use.
