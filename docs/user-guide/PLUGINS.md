# Plugins

**Honest status as of Phase 17 (2026-08-11): there is no plugin system in Rasik Studio yet.**
`PLUGIN_SYSTEM.md` at the project root is a real, detailed architecture design (manifest format,
permission model, sandboxing approach) — but it describes a planned system, not a working one.
No plugin runtime, no plugin manager UI, no way to install, enable, disable, or run a plugin
exists in the app today.

This page exists (rather than being silently omitted) because a "Plugins" page is part of this
project's own documented user-guide scope, and the honest answer belongs here rather than a gap
a user has to discover by trial and error.

If you're looking for the *design* of what plugins will eventually look like, see:

- `PLUGIN_SYSTEM.md` (project root) — the full architecture
- `docs/plugin-authoring/` — a developer-facing walkthrough of that design, also explicitly
  labeled as describing a system that doesn't run yet

## Why this gap exists

No phase in this project's 18-phase build roadmap (`docs/roadmap/`) actually builds the plugin
runtime — it's referenced in `CLAUDE.md`'s overall feature list and has its own standalone design
doc, but was never assigned to a phase the way every other major feature (Git, Terminal, Docker,
Browser, etc.) was. Building it would be a substantial, multi-week effort on the scale of any
other single phase in this roadmap, not something to slip in as a side effect of writing
documentation — tracked honestly in `TASKS.md` as real, unscheduled future work.
