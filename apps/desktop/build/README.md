# apps/desktop/build/

Static assets consumed by `electron-builder` during packaging. These files are not served at runtime — they are embedded into the installer.

## Contents

| File/Folder | Purpose |
|---|---|
| `icons/` | Platform-specific application icons |
| `entitlements.mac.plist` | macOS hardened runtime entitlements |

## Icon Requirements

All icons must be provided in the following formats before a release build:

| File | Format | Size | Platform |
|---|---|---|---|
| `icon.ico` | ICO (multi-size) | 16–256px | Windows |
| `icon.icns` | ICNS | 16–1024px | macOS |
| `icons/` | PNG set | 16–512px | Linux |

Do not commit SVG or other vector formats here — electron-builder requires raster formats for packaging.

**Status (Phase 15, 2026-08-06):** all three now exist — a simple `</>` code-bracket mark (dark
`#1e1e1e` rounded square, `#007acc` accent-blue stroke, matching this app's own editor background
and `--color-accent-primary`), drawn as pure geometry (no font dependency) at every size
electron-builder needs. This unblocks the packaging pipeline (`pnpm build:win/mac/linux` no longer
fail on a missing icon) and is a real, deliberate mark — not a placeholder image — but it's a
programmatically generated stand-in, not reviewed brand design. Replace with real branding
whenever that's decided; nothing downstream depends on the current mark's specific appearance.
