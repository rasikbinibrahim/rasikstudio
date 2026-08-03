# apps/desktop/src/styles/themes/

Theme definition files. Each theme is a JSON file that maps CSS custom property names to color values, plus a Monaco Editor theme definition.

## Built-in Themes (to be created in Phase 3)

| File | Description |
|---|---|
| `rasik-dark.json` | Default dark theme (mirrors `global.css` dark vars) |
| `rasik-light.json` | Light theme |
| `high-contrast-dark.json` | High contrast for accessibility |
| `high-contrast-light.json` | High contrast light |

## Theme File Format

```json
{
  "name": "Rasik Dark",
  "type": "dark",
  "colors": {
    "--color-bg-base": "#1e1e1e",
    "--color-bg-panel": "#252526"
  },
  "monacoTheme": {
    "base": "vs-dark",
    "rules": [],
    "colors": {}
  }
}
```

Both the CSS tokens and the Monaco theme must be kept in sync within each file. When a new CSS token is added to `global.css`, it must be added to all theme files here.

Community themes are installed as plugins and do not live in this directory.
