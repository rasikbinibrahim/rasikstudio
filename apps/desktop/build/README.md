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
