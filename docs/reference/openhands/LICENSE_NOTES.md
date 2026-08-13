# OpenHands — License Notes

**License:** MIT.

## Obligations

Same as VSCodium's (see that folder's `LICENSE_NOTES.md`): preserve the copyright notice and
license text in any copy or substantial portion of the software. No copyleft, no NOTICE-file
requirement, no patent-grant clause (that's Apache 2.0 — see Cline/Continue/Playwright's notes).

## What this project actually did

No OpenHands source was copied. `ANALYSIS.md`/`SANDBOX_NOTES.md`/`MULTI_AGENT_NOTES.md` document
architectural patterns (the Runtime/sandbox abstraction, the delegate-action multi-agent protocol)
studied from OpenHands' publicly available source, then compared against this project's already-
independently-built equivalents (`resolve_workspace_path()`'s guard-based isolation instead of
container sandboxing, `create_agent`/`run_sub_agent()` instead of a delegate action) — see
`ANALYSIS.md` §9/§10 for the explicit reuse-vs-reimplementation breakdown. Nothing here triggers
an attribution obligation since no code was vendored.

## If a future contribution copies OpenHands source directly

Preserve its MIT copyright header in the copied file (or a root `THIRD_PARTY_NOTICES.md` for
anything beyond a trivial snippet) — same procedure as any other MIT dependency, compatible with
this project's own Apache 2.0 `LICENSE` without requiring relicensing of the MIT portion.
