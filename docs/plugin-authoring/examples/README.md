# docs/plugin-authoring/examples/

Complete, runnable example plugins demonstrating key plugin API capabilities. Each example is a self-contained directory with its own `rasik-plugin.json` and source code.

## Examples (to be created in Phase 17)

| Directory | Type | Demonstrates |
|---|---|---|
| `hello-world/` | sidebar-panel | Minimal plugin with a sidebar panel — the starting point |
| `word-count/` | editor-action | Reads the current file via `api.editor.getContent()` |
| `custom-ai-tool/` | ai-tool | Registers a custom AI tool visible in the chat panel |
| `file-templates/` | workspace-provider | Adds project template scaffolding via `api.workspace.*` |

## Running an Example

```bash
# Install the example as a local plugin for development
cd docs/plugin-authoring/examples/hello-world
pnpm install && pnpm build
rasik-studio install-plugin .
```
