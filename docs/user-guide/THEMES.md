# Themes

Rasik Studio ships two built-in themes, Dark and Light, switchable in **Settings → Appearance**
or via the **Toggle Theme** command palette entry. Both are real CSS custom-property sets applied
to the document root, covering the whole IDE chrome (not just the editor) — including Monaco's
own two matching editor themes (`rasik-dark`/`rasik-light`), defined once and kept in sync with
the app-wide theme so the editor never looks mismatched against the rest of the UI.

Your choice persists across restarts and is applied before the first paint, so there's no visible
flash of the wrong theme on launch.

## Community themes

**Not built.** There's no theme marketplace, no custom-theme file format, and no way to install a
third-party theme today — only the two built-in options exist. This is listed here rather than
silently omitted because a "Themes" doc page is part of this project's own documented user-guide
scope; the honest answer is that community theming doesn't exist yet, not that it's hidden
somewhere.
