# apps/desktop/src/features/settings/

Settings panel covering all four configuration layers: global defaults, user settings, workspace settings, and session overrides.

## Files (to be created in Phase 3)

| File | Purpose |
|---|---|
| `SettingsPanel.tsx` | Root panel with category sidebar + settings form |
| `SettingsCategory.tsx` | Single settings category (Editor, AI, Terminal, Theme, Keybindings) |
| `SettingRow.tsx` | Individual setting: label, description, control (input/toggle/select) |
| `KeybindingsEditor.tsx` | Table of all keybindings with edit-in-place |
| `ThemePicker.tsx` | Visual theme selection grid |
| `useSettings.ts` | Hook: reads from `store/settings-slice`, writes via `window.rasik.settings.*` |

## Settings Layer Precedence

```
Global defaults ← User settings ← Workspace settings ← Session overrides
```

The panel shows the effective value with a badge indicating which layer set it. A "Reset to default" action removes the override at the current layer.

## What Goes in Settings

The full settings schema is defined in `WORKSPACE_MANAGEMENT.md §4`. All settings keys must be declared in that schema before they appear in this panel.
