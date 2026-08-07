import { useEffect } from 'react'
import { useAppStore } from '../store'
import type { WsEvent, WsEventType } from '../services/ws-client'

/** Subscribes `handler` to `eventType` for as long as the calling component is mounted.
 *  TypeScript-safe: `eventType` is constrained to `WsEventType`, so a typo'd event name is a
 *  compile error rather than a silently-never-firing subscription. */
export function useWebSocketEvent(eventType: WsEventType, handler: (event: WsEvent) => void): void {
  const client = useAppStore((state) => state.wsClient)

  useEffect(() => {
    return client.on(eventType, handler)
  }, [client, eventType, handler])
}
