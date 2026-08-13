# Playwright — License Notes

**License:** Apache License 2.0.

## Obligations

Same category as Cline's/Continue's (see those folders' `LICENSE_NOTES.md`): preserve copyright/
license text, note significant changes to any copied file, carry forward any upstream `NOTICE`
file's contents, patent grant included.

## What this project actually did

`playwright` is a normal, unmodified `pip`/`uv` dependency (see `ANALYSIS.md` §4/§9) — its license
terms are satisfied by depending on the published package without modifying its source, with
`uv.lock` recording the exact version. The browser binaries Playwright itself manages
(`playwright install --with-deps chromium`) are Google's own Chromium build, under Chromium's own
(BSD-style, permissive) license terms — a separate license from Playwright's own Apache 2.0,
already satisfied by not modifying or redistributing that binary outside of what Playwright's own
install mechanism does. No separate attribution file was needed for either.

## If a future contribution modifies Playwright's own source

Would need to preserve its Apache 2.0 copyright header and note the changes — not applicable
today, since this project consumes the published package unmodified.
