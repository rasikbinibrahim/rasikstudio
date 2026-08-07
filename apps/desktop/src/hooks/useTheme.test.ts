import { beforeEach, describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAppStore } from '../store'
import { useTheme } from './useTheme'

describe('useTheme', () => {
  beforeEach(() => {
    useAppStore.setState({ theme: 'dark' })
    document.documentElement.removeAttribute('data-theme')
  })

  it('returns the current theme and setters from the store', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
    expect(typeof result.current.setTheme).toBe('function')
    expect(typeof result.current.toggleTheme).toBe('function')
  })

  it('syncs data-theme on <html> to the current theme on mount', () => {
    renderHook(() => useTheme())
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('updates data-theme on <html> when the theme changes', () => {
    const { result } = renderHook(() => useTheme())

    act(() => {
      result.current.setTheme('light')
    })

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('toggleTheme flips between dark and light', () => {
    const { result } = renderHook(() => useTheme())

    act(() => {
      result.current.toggleTheme()
    })

    expect(useAppStore.getState().theme).toBe('light')
  })
})
