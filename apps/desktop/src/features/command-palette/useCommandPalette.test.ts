import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCommandPalette } from './useCommandPalette'

describe('useCommandPalette', () => {
  it('starts closed, in files mode, with an empty query', () => {
    const { result } = renderHook(() => useCommandPalette())

    expect(result.current.open).toBe(false)
    expect(result.current.mode).toBe('files')
    expect(result.current.query).toBe('')
  })

  it('openPalette("files") opens with an empty query', () => {
    const { result } = renderHook(() => useCommandPalette())

    act(() => result.current.openPalette('files'))

    expect(result.current.open).toBe(true)
    expect(result.current.mode).toBe('files')
    expect(result.current.query).toBe('')
  })

  it('openPalette("commands") opens with a leading ">" query, matching the VS Code convention', () => {
    const { result } = renderHook(() => useCommandPalette())

    act(() => result.current.openPalette('commands'))

    expect(result.current.open).toBe(true)
    expect(result.current.mode).toBe('commands')
    expect(result.current.query).toBe('>')
  })

  it('closePalette closes and clears the query', () => {
    const { result } = renderHook(() => useCommandPalette())
    act(() => result.current.openPalette('commands'))

    act(() => result.current.closePalette())

    expect(result.current.open).toBe(false)
    expect(result.current.query).toBe('')
  })

  it('typing ">" switches mode to commands even without going through openPalette', () => {
    const { result } = renderHook(() => useCommandPalette())
    act(() => result.current.openPalette('files'))

    act(() => result.current.setQuery('>rest'))

    expect(result.current.mode).toBe('commands')
    expect(result.current.query).toBe('>rest')
  })

  it('deleting the leading ">" switches mode back to files', () => {
    const { result } = renderHook(() => useCommandPalette())
    act(() => result.current.openPalette('commands'))

    act(() => result.current.setQuery('foo'))

    expect(result.current.mode).toBe('files')
    expect(result.current.query).toBe('foo')
  })
})
