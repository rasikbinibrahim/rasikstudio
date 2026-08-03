# docs/plugin-authoring/

Complete documentation for third-party plugin developers. Covers the plugin manifest format, available API surface, sandbox constraints, and distribution.

## Contents (to be created in Phase 17)

| File | Contents |
|---|---|
| `GETTING_STARTED.md` | Hello World plugin walkthrough (5-minute guide) |
| `MANIFEST_REFERENCE.md` | Complete `rasik-plugin.json` schema reference |
| `API_REFERENCE.md` | All `api.*` namespaces available to plugins |
| `PERMISSIONS.md` | All 10 permissions, what they grant, and how to declare them |
| `SANDBOX.md` | What plugins can and cannot do (security model) |
| `DISTRIBUTION.md` | How to package, sign, and publish a plugin |
| `examples/` | Complete runnable example plugins |

## Plugin Manifest Quick Reference

```json
{
  "id": "my-org.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "type": "sidebar-panel",
  "entry": "dist/index.js",
  "permissions": ["workspace.read", "editor.read"],
  "engines": { "rasikStudio": ">=1.0.0" }
}
```

See `PLUGIN_SYSTEM.md` in the project root for the full architecture.
