# apps/desktop/src/features/extensions/

Plugin and extension marketplace panel. Browse, install, enable, disable, and configure plugins.

## Status

Planned for a post-v1.0 release. The plugin system architecture is defined in `PLUGIN_SYSTEM.md`.

## Files (to be created in a future phase)

| File | Purpose |
|---|---|
| `ExtensionsPanel.tsx` | Root panel: search, installed list, marketplace browse |
| `PluginCard.tsx` | Single plugin: name, description, author, install/uninstall button |
| `InstalledPlugins.tsx` | List of currently installed plugins with enable/disable toggles |
| `PluginDetailView.tsx` | Full plugin detail page with README and permissions list |
| `useExtensions.ts` | Hook: plugin registry interactions |

## Plugin Isolation

Plugins run in a sandboxed renderer process — not in the main IDE renderer. The plugin API bridge enforces declared permissions. See `PLUGIN_SYSTEM.md §5` for the sandbox architecture.
