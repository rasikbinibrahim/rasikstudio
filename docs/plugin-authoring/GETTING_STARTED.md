# Getting Started: Hello World Plugin

> **This describes a planned design, not a working system.** No plugin runtime exists in Rasik
> Studio yet — this walkthrough shows what authoring a plugin is *designed* to look like per
> `PLUGIN_SYSTEM.md`, so plugin authors can prepare and this documentation obligation is met
> honestly rather than left blank. None of the commands below can actually be run against a real
> build of the app today. See `docs/user-guide/PLUGINS.md` for why.

## What you'd build

A minimal sidebar-panel plugin that shows a button; clicking it reads your current selection and
asks the AI to explain it.

## 1. The manifest (`rasik-plugin.json`)

```json
{
  "id": "com.example.hello-world",
  "name": "Hello World",
  "version": "1.0.0",
  "description": "Explains your current selection using AI chat",
  "author": "You <you@example.com>",
  "license": "MIT",
  "type": "sidebar-panel",
  "entry": "dist/index.js",
  "permissions": ["editor.read", "ai.chat"],
  "contributes": {
    "panels": [
      { "id": "hello-world.panel", "title": "Hello World", "icon": "assets/icon.svg", "position": "left" }
    ],
    "commands": [
      { "id": "hello-world.explain", "title": "Hello World: Explain Selection", "keybinding": "ctrl+shift+m" }
    ]
  },
  "engines": { "rasikStudio": ">=1.0.0" }
}
```

See `MANIFEST_REFERENCE.md` for every field.

## 2. The entry point (`dist/index.js`)

```typescript
import type { PluginAPI } from '@rasik-studio/plugin-api' // planned package, doesn't exist yet

export function activate(api: PluginAPI): void {
  api.commands.register('hello-world.explain', async () => {
    const text = await api.editor.getSelectedText()
    if (!text) {
      api.ui.showMessage('Select some code first.', 'warning')
      return
    }
    const result = await api.ai.chat([{ role: 'user', content: `Explain this: ${text}` }])
    api.ui.showMessage(result, 'info')
  })
}

export function deactivate(): void {
  // Disposables registered via `activate()` are cleaned up automatically — nothing usually
  // needs to go here.
}
```

Full API surface: `API_REFERENCE.md`. Permission requirements: `PERMISSIONS.md`.

## 3. Installing it (planned)

Per `PLUGIN_SYSTEM.md` §10, the first supported install path is a local `.zip` or a GitHub
release URL — no hosted marketplace in the initial design. The user would be prompted to approve
the `editor.read`/`ai.chat` permissions declared above before the plugin activates.

## What's real today, if you want to build something like this now

The features a sidebar-panel plugin would eventually provide (a custom panel reading editor
selection and calling AI chat) can currently only be built by modifying Rasik Studio's own source
directly — see `CONTRIBUTING.md` — not by writing an installable, sandboxed plugin.
