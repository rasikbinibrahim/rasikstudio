export type Theme = 'dark' | 'light'

const THEME_STORAGE_KEY = 'rasik-studio.theme'

/** Synchronous by design — called before the first React render to avoid a flash of the wrong theme. */
export function readPersistedTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'dark'
  return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
}

export function persistTheme(theme: Theme): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(THEME_STORAGE_KEY, theme)
}
