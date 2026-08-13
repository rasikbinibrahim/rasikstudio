import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from './index'

describe('settings-slice', () => {
  beforeEach(() => {
    useAppStore.setState({ theme: 'dark' })
  })

  it('toggleTheme switches from dark to light', () => {
    useAppStore.getState().toggleTheme()
    expect(useAppStore.getState().theme).toBe('light')
  })

  it('toggleTheme switches from light back to dark', () => {
    useAppStore.setState({ theme: 'light' })
    useAppStore.getState().toggleTheme()
    expect(useAppStore.getState().theme).toBe('dark')
  })

  it('persists the theme to localStorage', () => {
    useAppStore.getState().setTheme('light')
    expect(localStorage.getItem('rasik-studio.theme')).toBe('light')
  })
})
