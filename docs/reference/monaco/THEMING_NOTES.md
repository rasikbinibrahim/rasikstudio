# Monaco Editor — Theming Notes

`defineTheme()`, `setTheme()`, and token color rules, as actually implemented in
`apps/desktop/src/features/editor/useMonaco.ts`/`MonacoEditor.tsx`.

## `defineTheme()` — themes are data, not CSS

Monaco themes are registered once via `monaco.editor.defineTheme(name, themeData)`, where
`themeData` is a plain object: `base` (one of Monaco's 4 built-in base themes — `vs`, `vs-dark`,
`hc-black`, `hc-light` — inherited from before any custom rules apply), `inherit` (whether to
keep the base theme's own rules underneath these), `rules` (an array of `{token, foreground,
fontStyle?}` — token-type-to-color mappings, where `token` is a TextMate-grammar scope name like
`comment` or `string`), and `colors` (workbench-level color overrides — editor background,
line-number color, selection color, cursor color — keyed by the same color-id strings VS Code's
own theming system uses, e.g. `editor.background`).

`defineRasikThemes()` (`useMonaco.ts`) registers exactly two themes this way:

```ts
monaco.editor.defineTheme('rasik-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [{ token: 'comment', foreground: '6a9955' }],
  colors: {
    'editor.background': '#1e1e1e',
    'editor.foreground': '#cccccc',
    // ...
  },
})
```

Only `token: 'comment'`'s color is overridden per theme — everything else relies on `vs-dark`'s/
`vs`'s own built-in TextMate rule set via `inherit: true`, which is why this project's two themes
are both short (the interesting per-language syntax-highlighting logic is already in Monaco's
base themes; this project's own theme definitions only need to layer this app's own editor
chrome colors on top).

## `setTheme()` — applied once at creation, re-applied on change

Two distinct code paths in `MonacoEditor.tsx`, deliberately separated (see that file's own
comment at line 63):

1. **Initial theme, baked into `monaco.editor.create()`'s options** (`MonacoEditor.tsx:32`) — the
   `theme` option passed at creation time, computed once from the app's current `theme` store
   value at mount. `theme` is intentionally excluded from that effect's own dependency array —
   changing the app's theme *after* the editor already exists shouldn't recreate the whole editor
   instance (which would lose undo history, cursor position, etc.).
2. **A separate "theme-sync" effect** (`MonacoEditor.tsx:67-71`) that calls
   `monaco.editor.setTheme(...)` whenever the app's `theme` store value changes after mount — this
   is Monaco's own documented way to switch a *live* editor's theme without recreating it.
   `monaco.editor.setTheme()` is notably a **global** call (it affects every Monaco editor
   instance on the page, not just one), which matters if this app ever supports multiple editor
   panes/split views simultaneously — a single `setTheme()` call correctly re-themes all of them
   at once, which is the desired behavior here (one app-wide theme, not per-pane theming).

## Token color rules: kept minimal, deliberately

Only the `comment` token is customized. This project's own dark/light theme design
(`editor.background`/`editor.foreground`/etc., defined once here and referenced nowhere else)
already tracks this app's broader `--color-*` CSS custom properties conceptually (both switch
together on the same app-level theme toggle — see `useTheme.ts`), but Monaco's theme system is
entirely separate from CSS custom properties (Monaco renders to canvas/its own DOM structure, not
through this app's Tailwind-driven component styles), so the two are kept in sync by application
logic (both read the same `theme` store value), not by any shared token-definition mechanism.
