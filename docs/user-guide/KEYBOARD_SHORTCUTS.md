# Keyboard Shortcuts

`Ctrl` below means `Cmd` on macOS (this app's keybinding hook normalizes to whichever modifier is
the platform convention). This is the real, complete list — generated from `App.tsx`'s actual
keybinding registrations and command palette entries, not a design-time wishlist.

| Shortcut | Action |
|---|---|
| `Ctrl+P` | Quick-open a file by name |
| `Ctrl+Shift+P` | Command palette |
| `` Ctrl+` `` | Toggle the terminal panel (starts a shell on first use) |
| `Ctrl+Shift+C` | Show AI Chat and focus its input |
| `Ctrl+Shift+G` | Show Source Control |
| `Ctrl+Shift+B` | Show Browser |
| `Ctrl+Shift+D` | Show Docker |
| `Ctrl+,` | Open Settings |
| `Ctrl+S` | Save the active file |
| `Ctrl+W` | Close the active tab |
| `Escape` | Close whatever overlay/dialog is currently open (Settings, command palette, etc.) |

## Commands with no default shortcut (available via the command palette, `Ctrl+Shift+P`)

- **Open Folder…**
- **Toggle Theme**
- **New Terminal**
- **Account: Sign In**
- **View: Show Agent Tasks**
- **View: Show Explorer**

## Inside the terminal / editor

Standard OS/shell/Monaco shortcuts apply once focus is inside those areas (e.g. your shell's own
history/completion keys in the terminal, Monaco's own extensive default keymap in the editor —
multi-cursor, `Ctrl+D` select-next-occurrence, etc. — inherited from Monaco itself, not
re-documented here).

## Customization

Not built yet — shortcuts are currently fixed, not user-remappable.
