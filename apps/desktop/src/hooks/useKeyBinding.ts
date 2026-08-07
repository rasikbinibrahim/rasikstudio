import { useEffect, useRef } from 'react'

export interface KeyBinding {
  key: string
  ctrlOrCmd?: boolean
  shift?: boolean
  alt?: boolean
  handler: () => void
}

function matches(event: KeyboardEvent, binding: KeyBinding): boolean {
  const ctrlOrCmd = binding.ctrlOrCmd
    ? event.ctrlKey || event.metaKey
    : !(event.ctrlKey || event.metaKey)
  const shift = binding.shift ? event.shiftKey : !event.shiftKey
  const alt = binding.alt ? event.altKey : !event.altKey
  return event.key.toLowerCase() === binding.key.toLowerCase() && ctrlOrCmd && shift && alt
}

/** Registers global keyboard shortcuts for the lifetime of the calling component.
 *  Subscribes once; the latest `bindings` are always read via ref, so callers don't need to
 *  memoize the array themselves. */
export function useKeyBinding(bindings: KeyBinding[]): void {
  const bindingsRef = useRef(bindings)
  bindingsRef.current = bindings

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const binding = bindingsRef.current.find((b) => matches(event, b))
      if (binding) {
        event.preventDefault()
        binding.handler()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
