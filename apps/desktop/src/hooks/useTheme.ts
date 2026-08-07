import { useEffect } from 'react'
import { useAppStore } from '../store'
import type { Theme } from '../store/settings-slice'

export interface UseThemeResult {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

/** Keeps `data-theme` on `<html>` in sync with the persisted theme setting for the lifetime of
 *  the calling component. The initial value is already applied synchronously in `main.tsx`
 *  before the first render — this hook only handles changes after mount. */
export function useTheme(): UseThemeResult {
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const toggleTheme = useAppStore((state) => state.toggleTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return { theme, setTheme, toggleTheme }
}
