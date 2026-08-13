# docs/plugin-authoring/examples/

> **No plugin runtime exists yet** (see `docs/user-guide/PLUGINS.md`) — nothing here is actually
> runnable against a real build of Rasik Studio. `hello-world/` is a complete, well-formed
> example matching `PLUGIN_SYSTEM.md`'s design (correct manifest shape, correct API usage per
> `../API_REFERENCE.md`), written so a future plugin runtime implementation has a real target to
> validate against — not a live demo.

## Examples

| Directory | Type | Demonstrates | Status |
|---|---|---|---|
| `hello-world/` | sidebar-panel | Minimal plugin — manifest + entry point, matching `../GETTING_STARTED.md`'s walkthrough | Written (design-only, unrunnable) |
| `word-count/` | editor-action | Reads the current file's content | Not written — same reason as everything else in this directory, not worth building 3 more unrunnable examples before the runtime exists to validate any of them against |
| `custom-ai-tool/` | ai-tool | Registers a custom AI tool visible in the chat panel | Not written |
| `file-templates/` | workspace-provider | Adds project template scaffolding | Not written |

## Once a real plugin runtime exists

The install command below is the design's intent (`PLUGIN_SYSTEM.md` §10's "local install"
path), not something that works today:

```bash
cd docs/plugin-authoring/examples/hello-world
pnpm install && pnpm build
rasik-studio install-plugin .   # does not exist yet
```
