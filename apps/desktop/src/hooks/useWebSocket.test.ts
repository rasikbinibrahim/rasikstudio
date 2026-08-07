import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAppStore } from '../store'
import { useWebSocketEvent } from './useWebSocket'
import type { WsEvent } from '../services/ws-client'

function fakeWsClient() {
  const handlers = new Map<string, Set<(event: WsEvent) => void>>()
  return {
    on: vi.fn((eventType: string, handler: (event: WsEvent) => void) => {
      const set = handlers.get(eventType) ?? new Set()
      set.add(handler)
      handlers.set(eventType, set)
      return () => set.delete(handler)
    }),
    emit: (eventType: string, event: WsEvent) => {
      for (const handler of handlers.get(eventType) ?? []) handler(event)
    },
  }
}

describe('useWebSocketEvent', () => {
  beforeEach(() => {
    useAppStore.setState({ wsClient: fakeWsClient() as unknown as never })
  })

  it('subscribes the handler to the given event type on mount', () => {
    const client = useAppStore.getState().wsClient as unknown as ReturnType<typeof fakeWsClient>
    const handler = vi.fn()

    renderHook(() => useWebSocketEvent('stream_chunk', handler))

    expect(client.on).toHaveBeenCalledWith('stream_chunk', expect.any(Function))
  })

  it('invokes the handler when the client emits that event type', () => {
    const client = useAppStore.getState().wsClient as unknown as ReturnType<typeof fakeWsClient>
    const handler = vi.fn()
    renderHook(() => useWebSocketEvent('stream_chunk', handler))

    const event = { type: 'stream_chunk' } as unknown as WsEvent
    client.emit('stream_chunk', event)

    expect(handler).toHaveBeenCalledWith(event)
  })

  it('unsubscribes on unmount', () => {
    const client = useAppStore.getState().wsClient as unknown as ReturnType<typeof fakeWsClient>
    const handler = vi.fn()
    const { unmount } = renderHook(() => useWebSocketEvent('stream_chunk', handler))

    unmount()
    client.emit('stream_chunk', {} as WsEvent)

    expect(handler).not.toHaveBeenCalled()
  })
})
