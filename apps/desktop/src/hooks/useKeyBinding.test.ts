import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useKeyBinding } from './useKeyBinding'

function dispatchKey(init: KeyboardEventInit): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { ...init, cancelable: true }))
}

describe('useKeyBinding', () => {
  it('calls the handler when the exact key + modifier combination is pressed', () => {
    const handler = vi.fn()
    renderHook(() => useKeyBinding([{ key: 'p', ctrlOrCmd: true, handler }]))

    dispatchKey({ key: 'p', ctrlKey: true })

    expect(handler).toHaveBeenCalledOnce()
  })

  it('does not call the handler when a required modifier is missing', () => {
    const handler = vi.fn()
    renderHook(() => useKeyBinding([{ key: 'p', ctrlOrCmd: true, handler }]))

    dispatchKey({ key: 'p', ctrlKey: false })

    expect(handler).not.toHaveBeenCalled()
  })

  it('does not call the handler for an unbound key', () => {
    const handler = vi.fn()
    renderHook(() => useKeyBinding([{ key: 'p', ctrlOrCmd: true, handler }]))

    dispatchKey({ key: 'q', ctrlKey: true })

    expect(handler).not.toHaveBeenCalled()
  })

  it('distinguishes bindings by shift/alt as well as the base key', () => {
    const withShift = vi.fn()
    const withoutShift = vi.fn()
    renderHook(() =>
      useKeyBinding([
        { key: 'p', ctrlOrCmd: true, shift: true, handler: withShift },
        { key: 'p', ctrlOrCmd: true, handler: withoutShift },
      ]),
    )

    dispatchKey({ key: 'p', ctrlKey: true, shiftKey: true })

    expect(withShift).toHaveBeenCalledOnce()
    expect(withoutShift).not.toHaveBeenCalled()
  })

  it('matches metaKey the same as ctrlKey for ctrlOrCmd bindings', () => {
    const handler = vi.fn()
    renderHook(() => useKeyBinding([{ key: 'p', ctrlOrCmd: true, handler }]))

    dispatchKey({ key: 'p', metaKey: true })

    expect(handler).toHaveBeenCalledOnce()
  })

  it('always reads the latest bindings without needing to re-subscribe', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ handler }) => useKeyBinding([{ key: 'p', ctrlOrCmd: true, handler }]), {
      initialProps: { handler: first },
    })

    rerender({ handler: second })
    dispatchKey({ key: 'p', ctrlKey: true })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })

  it('removes its listener on unmount', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() => useKeyBinding([{ key: 'p', ctrlOrCmd: true, handler }]))

    unmount()
    dispatchKey({ key: 'p', ctrlKey: true })

    expect(handler).not.toHaveBeenCalled()
  })
})
