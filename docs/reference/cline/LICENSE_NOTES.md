# Cline — License Notes

**License:** Apache License 2.0.

## Obligations

Apache 2.0 permits use, modification, and redistribution (including in closed-source/commercial
products) subject to: preserve the copyright notice and license text; state significant changes
made to any copied file; include a `NOTICE` file's contents (if the upstream project ships one)
in redistributions; Apache 2.0 also includes an explicit patent grant from contributors, absent
from MIT.

## What this project actually did

No Cline source was copied — `ANALYSIS.md`/`TOOL_DESIGN_NOTES.md`/`APPROVAL_GATE_NOTES.md`
document architectural patterns studied from Cline's publicly available source and behavior, then
re-implemented independently in this project's own Python/FastAPI agent framework (see
`ANALYSIS.md` §9/§10 for exactly what was and wasn't reused, conceptually vs. literally). No
`NOTICE` obligation applies since nothing was copied; this project's own `NOTICE`-equivalent
concern (should this repo ever gain one) would only need an entry if a future contribution
actually vendors Cline code.

## If a future contribution copies Cline source directly

Preserve Cline's copyright header in the copied file, note what was changed, and check whether
Cline's own repository ships a `NOTICE` file — if so, its contents need to be carried into this
project's distribution (e.g. a root `THIRD_PARTY_NOTICES.md`, not yet needed since this applies
only once real Apache-2.0 source is actually vendored).
