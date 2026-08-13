# Plugin Manifest Reference (`rasik-plugin.json`)

> Planned design — see `GETTING_STARTED.md`'s banner. Mirrors `PLUGIN_SYSTEM.md` §3 exactly; this
> file exists so plugin authors have a field-by-field reference instead of reading the whole
> architecture doc.

## Required fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Reverse-DNS-style unique id, e.g. `com.example.my-plugin` |
| `name` | string | Display name |
| `version` | string | Semver |
| `type` | one of the 6 plugin types below | What kind of extension point this plugin uses |
| `entry` | string | Path to the compiled JS entry point (relative to the manifest) |
| `permissions` | string[] | See `PERMISSIONS.md` — declared up front, not requestable at runtime |
| `engines.rasikStudio` | semver range | Minimum compatible app version |

## Optional fields

| Field | Type | Description |
|---|---|---|
| `description` | string | Shown in the (planned) plugin manager UI |
| `author` | string | `Name <email>` |
| `license` | string | SPDX identifier |
| `contributes.panels` | array | Sidebar panels this plugin registers (`id`, `title`, `icon`, `position`) |
| `contributes.commands` | array | Command-palette entries (`id`, `title`, optional `keybinding`) |

## Plugin types

| Type | Description | Example |
|---|---|---|
| `language` | Syntax highlighting, formatting, LSP integration | Rust support, TOML formatter |
| `theme` | Color themes and icon packs | Dracula theme, Material icons |
| `ai-tool` | Custom tools available to AI agents | Jira integration, custom API caller |
| `sidebar-panel` | Custom panel in the left/right sidebar | Database explorer, API tester |
| `editor-action` | Code action / right-click menu item | "Open in browser", "Copy as cURL" |
| `workspace-provider` | Custom workspace type | SSH workspace, container workspace |

## Full example

```json
{
  "id": "com.example.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Does something useful",
  "author": "Author Name <author@example.com>",
  "license": "MIT",
  "type": "sidebar-panel",
  "entry": "dist/index.js",
  "permissions": ["workspace.read", "workspace.write", "network.fetch"],
  "contributes": {
    "panels": [
      { "id": "my-plugin.panel", "title": "My Panel", "icon": "assets/icon.svg", "position": "left" }
    ],
    "commands": [
      { "id": "my-plugin.doSomething", "title": "My Plugin: Do Something", "keybinding": "ctrl+shift+m" }
    ]
  },
  "engines": { "rasikStudio": ">=1.0.0" }
}
```
