import type { StateCreator } from 'zustand'
import type { AppStore } from './types'
import { type Theme, persistTheme, readPersistedTheme } from '../lib/theme-storage'
import { getBackendHttpBaseUrl, setBackendHttpBaseUrl } from '../lib/backend-config'

export type { Theme }

const FONT_SIZE_KEY = 'rasik-studio.editorFontSize'
const WORD_WRAP_KEY = 'rasik-studio.editorWordWrap'
const DEFAULT_FONT_SIZE = 13
export const MIN_EDITOR_FONT_SIZE = 8
export const MAX_EDITOR_FONT_SIZE = 32

function readPersistedFontSize(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_FONT_SIZE
  const stored = Number(localStorage.getItem(FONT_SIZE_KEY))
  return Number.isFinite(stored) && stored >= MIN_EDITOR_FONT_SIZE && stored <= MAX_EDITOR_FONT_SIZE
    ? stored
    : DEFAULT_FONT_SIZE
}

function readPersistedWordWrap(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(WORD_WRAP_KEY) === 'on'
}

export interface SettingsSlice {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  editorFontSize: number
  setEditorFontSize: (size: number) => void
  editorWordWrap: boolean
  setEditorWordWrap: (wordWrap: boolean) => void
  /** Read from `lib/backend-config.ts` (localStorage-backed) into the store purely so
   *  `Settings.tsx` re-renders when it changes — every actual HTTP/WS call already reads
   *  `getBackendHttpBaseUrl()`/`getBackendWsBaseUrl()` fresh each time, not this field. */
  backendUrl: string
  setBackendUrl: (url: string) => void
}

export const createSettingsSlice: StateCreator<
  AppStore,
  [['zustand/immer', never]],
  [],
  SettingsSlice
> = (set, get) => ({
  theme: readPersistedTheme(),

  setTheme: (theme) => {
    set((state) => {
      state.theme = theme
    })
    persistTheme(theme)
  },

  toggleTheme: () => {
    get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
  },

  editorFontSize: readPersistedFontSize(),
  setEditorFontSize: (size) => {
    const clamped = Math.min(MAX_EDITOR_FONT_SIZE, Math.max(MIN_EDITOR_FONT_SIZE, Math.round(size)))
    set((state) => {
      state.editorFontSize = clamped
    })
    localStorage.setItem(FONT_SIZE_KEY, String(clamped))
  },

  editorWordWrap: readPersistedWordWrap(),
  setEditorWordWrap: (wordWrap) => {
    set((state) => {
      state.editorWordWrap = wordWrap
    })
    localStorage.setItem(WORD_WRAP_KEY, wordWrap ? 'on' : 'off')
  },

  backendUrl: getBackendHttpBaseUrl(),
  setBackendUrl: (url) => {
    setBackendHttpBaseUrl(url)
    set((state) => {
      state.backendUrl = getBackendHttpBaseUrl()
    })
  },
})
