# Hello World Plugin (example)

Design-only — see the parent `examples/README.md` and `../GETTING_STARTED.md`. This directory
shows the complete, correct shape of a minimal `sidebar-panel` plugin: a manifest
(`rasik-plugin.json`) declaring exactly the two permissions it needs (`editor.read`, `ai.chat`),
and an entry point (`src/index.ts`) that registers one command using only those two permissions'
worth of the `PluginAPI` surface.

No `package.json`/build step is included — there's nothing real to compile against
(`@rasik-studio/plugin-api` doesn't exist as an installable package yet). Once a real plugin
runtime and API package exist, this example is the intended reference implementation to update
first.
