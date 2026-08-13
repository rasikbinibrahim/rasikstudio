# xterm.js — License Notes

**License:** MIT.

## Obligations

Same as VSCodium's/OpenHands'/Ollama's/Monaco's (see those folders' `LICENSE_NOTES.md`): preserve
the copyright notice and license text. No copyleft, no NOTICE-file requirement.

## What this project actually did

`@xterm/xterm` and its addon packages (`@xterm/addon-fit`, `@xterm/addon-search`,
`@xterm/addon-unicode11`, `@xterm/addon-webgl`) are normal, unmodified `package.json` dependencies
(see `ANALYSIS.md` §4/§9) — satisfied the same way as any other npm dependency, via `pnpm`'s
lockfile recording the exact versions without modifying published source. `node-pty` (a separate
project, also MIT-licensed) is likewise an unmodified native-module dependency.

## If this project ever modified xterm.js/node-pty source directly

Would need to preserve the relevant copyright header and note the changes — not applicable today.
