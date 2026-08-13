# Continue — License Notes

**License:** Apache License 2.0.

## Obligations

Same as Cline's (see that folder's `LICENSE_NOTES.md`): preserve copyright/license text, note
significant changes to any copied file, carry forward any upstream `NOTICE` file's contents, and
Continue's contributors extend an explicit patent grant with their contributions.

## What this project actually did

No Continue source was copied. `ANALYSIS.md`/`CONTEXT_BUILDING_NOTES.md`/`COMPLETION_NOTES.md`
document architectural patterns (the pluggable context-provider abstraction, role-based model
config, the inline-completion pipeline) studied from Continue's publicly available source, then
compared against this project's own already-built (`context_builder.py`) or deliberately-not-yet-
built (inline completions) equivalents. No attribution obligation applies since nothing was
vendored.

## If a future contribution copies Continue source directly

Preserve its Apache 2.0 copyright header, note the changes made, and check for a `NOTICE` file to
carry forward — same procedure as Cline's `LICENSE_NOTES.md` describes, compatible with this
project's own Apache 2.0 `LICENSE` without any relicensing concern (same license family).
