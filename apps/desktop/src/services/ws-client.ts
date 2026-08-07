// Mirrors apps/backend/app/api/ws/event_types.py's ServerEvent discriminated union — keep the
// two in sync by hand until Phase 4's deferred OpenAPI-generated-types decision (ADR 0007) covers
// WebSocket payloads too (it's currently scoped to the REST API).
export type WsEventType =
  | 'stream_chunk'
  | 'stream_end'
  | 'agent_started'
  | 'agent_step'
  | 'agent_approval_required'
  | 'agent_status_changed'
  | 'agent_completed'
  | 'agent_failed'
  | 'file_changed'
  | 'git_status_changed'
  | 'index_progress'

export interface WsEvent {
  type: WsEventType
  workspace_id: string
  user_id: string | null
  timestamp: string
  [key: string]: unknown
}

export type WsConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface WsClientOptions {
  /** Called on every (re)connect attempt, not read once at construction — so a backend URL
   *  changed later in Settings takes effect on the next connect without needing a new `WsClient`
   *  instance. Returns e.g. "ws://localhost:8000" — no trailing slash, no `/ws/{workspace_id}`
   *  suffix. */
  getBaseUrl: () => string
  /** Called on every (re)connect attempt. `null` means "nothing to authenticate with yet" —
   *  the client skips opening a socket at all rather than opening one the server will
   *  immediately close with 4401. */
  getToken: () => Promise<string | null>
  onStatusChange?: (status: WsConnectionStatus) => void
  /** First reconnect delay; doubles each attempt up to `maxReconnectDelayMs`. Defaults keep the
   *  first retry fast and the ceiling at 5s, matching phase-07-websocket-gateway.md's acceptance
   *  criterion ("reconnects automatically... within 5 seconds"). */
  reconnectDelayMs?: number
  maxReconnectDelayMs?: number
}

type EventHandler = (event: WsEvent) => void

/** One persistent WebSocket connection to `/ws/{workspaceId}`, with first-message JWT auth
 *  (ADR 0005) and exponential-backoff reconnect. Framework-agnostic on purpose — `useWebSocket.ts`
 *  and `store/ws-slice.ts` are the React/Zustand-facing wrappers around this. */
export class WsClient {
  private socket: WebSocket | null = null
  private readonly handlers = new Map<WsEventType, Set<EventHandler>>()
  private workspaceId: string | null = null
  private shouldReconnect = false
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly options: WsClientOptions) {}

  /** Returns an unsubscribe function — TypeScript-safe: `eventType` narrows which shape of
   *  `WsEvent` the handler receives once per-event-type payload types exist (currently one
   *  shared `WsEvent` shape; see the mirrored union comment above). */
  on(eventType: WsEventType, handler: EventHandler): () => void {
    if (!this.handlers.has(eventType)) this.handlers.set(eventType, new Set())
    this.handlers.get(eventType)?.add(handler)
    return () => this.handlers.get(eventType)?.delete(handler)
  }

  async connect(workspaceId: string): Promise<void> {
    this.workspaceId = workspaceId
    this.shouldReconnect = true
    this.reconnectAttempt = 0
    await this.openSocket()
  }

  disconnect(): void {
    this.shouldReconnect = false
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.socket?.close()
    this.socket = null
    this.setStatus('disconnected')
  }

  private async openSocket(): Promise<void> {
    if (this.workspaceId === null) return
    this.setStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting')

    const token = await this.options.getToken()
    if (token === null) {
      this.setStatus('disconnected')
      return
    }

    const socket = new WebSocket(`${this.options.getBaseUrl()}/ws/${this.workspaceId}`)
    this.socket = socket

    socket.onmessage = (messageEvent) => {
      const message = JSON.parse(messageEvent.data as string) as { type: string }

      if (message.type === 'auth_required') {
        socket.send(JSON.stringify({ type: 'auth', token }))
        return
      }
      if (message.type === 'connected') {
        this.reconnectAttempt = 0
        this.setStatus('connected')
        return
      }
      if (message.type === 'pong') return

      this.dispatch(message as WsEvent)
    }

    socket.onclose = () => {
      this.socket = null
      if (this.shouldReconnect) {
        this.scheduleReconnect()
      } else {
        this.setStatus('disconnected')
      }
    }
  }

  private scheduleReconnect(): void {
    this.setStatus('reconnecting')
    const base = this.options.reconnectDelayMs ?? 1000
    const max = this.options.maxReconnectDelayMs ?? 5000
    const delay = Math.min(base * 2 ** this.reconnectAttempt, max)
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.openSocket()
    }, delay)
  }

  private setStatus(status: WsConnectionStatus): void {
    this.options.onStatusChange?.(status)
  }

  private dispatch(event: WsEvent): void {
    const handlers = this.handlers.get(event.type)
    if (!handlers) return
    for (const handler of handlers) handler(event)
  }
}
