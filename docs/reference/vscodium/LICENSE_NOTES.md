# VSCodium (Code - OSS) — License Notes

**License:** MIT (both VSCodium's own build-script repo and the underlying `microsoft/vscode`
source it builds — Microsoft publishes the product under the MIT license as `Code - OSS`; the
proprietary bits are limited to Microsoft's own branding/telemetry/marketplace terms, which
VSCodium's build strips out specifically so the *build artifact* stays unambiguously MIT with no
Microsoft trademark/telemetry attached).

## Obligations

MIT requires only: preserve the copyright notice and license text in any copy or substantial
portion of the software. No copyleft, no source-disclosure requirement, no NOTICE-file
requirement (that's Apache 2.0 — see the Cline/Continue/Playwright license notes for contrast).

## What this project actually did

No VS Code/VSCodium source was copied into this repository (see `ANALYSIS.md` §9/§10 — the
architecture was studied and re-implemented in this project's own idiom, not vendored). The one
piece of VS Code's own codebase this project *does* depend on directly is `monaco-editor`
(published separately, MIT — see the Monaco reference analysis's own `LICENSE_NOTES.md`), which
is already a normal `package.json` dependency with its license terms satisfied the same way every
other npm dependency's license is: by not modifying its published source and letting `pnpm`
resolve/record it normally. No separate attribution file was needed since nothing was copied.

## If a future contribution ever copies VS Code source directly

Add its MIT copyright notice verbatim to that file's header (or to a `THIRD_PARTY_NOTICES.md` at
the repo root if adapting more than a trivial snippet) — this project's own `LICENSE` file (Apache
2.0, chosen 2026-08-11) does not need to change to accommodate an MIT dependency; the two licenses
are compatible (Apache 2.0 code may depend on / redistribute MIT code without relicensing the MIT
portion).
