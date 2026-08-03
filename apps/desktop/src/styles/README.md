# apps/desktop/src/styles/

Global CSS files: CSS custom property token definitions, base resets, and design system foundations. All theme-specific overrides live in `themes/`.

## Files (to be created in Phase 3)

| File | Purpose |
|---|---|
| `global.css` | CSS custom property definitions for both dark and light themes (all tokens from UI_DESIGN_SYSTEM.md §3.1), base HTML resets |
| `editor.css` | Monaco Editor overrides that cannot be done via `defineTheme()` |
| `terminal.css` | xterm.js container sizing and scrollbar styling |

## Token Architecture

All color, spacing, and typography values are defined as CSS custom properties on `:root[data-theme="dark"]` and `:root[data-theme="light"]`. Tailwind utility classes reference these variables via `tailwind.config.js`. Component code never uses raw hex values.

```css
/* Correct */
color: var(--color-text-primary);
background: var(--color-bg-panel);

/* Wrong — never do this */
color: #cccccc;
background: #252526;
```
