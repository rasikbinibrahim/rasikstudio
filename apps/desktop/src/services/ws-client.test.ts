import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WsClient, type WsConnectionStatus, type WsEvent } from './ws-client'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []

  readonly url: string
  readonly sent: string[] = []
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.onclose?.()
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  emitClose(): void {
    this.onclose?.()
  }
}

function lastSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances.at(-1)
  if (!socket) throw new Error('no FakeWebSocket was constructed')
  return socket
}

describe('WsClient', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('does not open a socket when getToken resolves null', async () => {
    const statuses: WsConnectionStatus[] = []
    const client = new WsClient({
      getBaseUrl: () => 'ws://localhost:8000',
      getToken: () => Promise.resolve(null),
      onStatusChange: (status) => statuses.push(status),
    })

    await client.connect('workspace-1')

    expect(FakeWebSocket.instances).toHaveLength(0)
    expect(statuses).toEqual(['connecting', 'disconnected'])
  })

  it('opens a socket to /ws/{workspaceId} when a token is available', async () => {
    const client = new WsClient({
      getBaseUrl: () => 'ws://localhost:8000',
      getToken: () => Promise.resolve('a-real-token'),
    })

    await client.connect('workspace-1')

    expect(lastSocket().url).toBe('ws://localhost:8000/ws/workspace-1')
  })

  it('answers auth_required by sending the token, then reports connected', async () => {
    const statuses: WsConnectionStatus[] = []
    const client = new WsClient({
      getBaseUrl: () => 'ws://localhost:8000',
      getToken: () => Promise.resolve('a-real-token'),
      onStatusChange: (status) => statuses.push(status),
    })
    await client.connect('workspace-1')
    const socket = lastSocket()

    socket.emitMessage({ type: 'auth_required' })
    expect(socket.sent).toEqual([JSON.stringify({ type: 'auth', token: 'a-real-token' })])

    socket.emitMessage({ type: 'connected', workspace_id: 'workspace-1', user_id: 'user-1' })
    expect(statuses).toContain('connected')
  })

  it('dispatches typed events to on() handlers and supports unsubscribe', async () => {
    const client = new WsClient({
      getBaseUrl: () => 'ws://localhost:8000',
      getToken: () => Promise.resolve('a-real-token'),
    })
    await client.connect('workspace-1')
    const socket = lastSocket()

    const received: WsEvent[] = []
    const unsubscribe = client.on('file_changed', (event) => received.push(event))

    const event = {
      type: 'file_changed',
      workspace_id: 'workspace-1',
      user_id: null,
      timestamp: '2026-08-04T00:00:00Z',
      path: 'src/main.py',
      change: 'modified',
    }
    socket.emitMessage(event)
    expect(received).toEqual([event])

    unsubscribe()
    socket.emitMessage(event)
    expect(received).toHaveLength(1) // no second delivery after unsubscribe
  })

  it('does not dispatch auth_required/connected/pong as application events', async () => {
    const client = new WsClient({
      getBaseUrl: () => 'ws://localhost:8000',
      getToken: () => Promise.resolve('a-real-token'),
    })
    await client.connect('workspace-1')
    const socket = lastSocket()

    const received: WsEvent[] = []
    client.on('file_changed', (event) => received.push(event))

    socket.emitMessage({ type: 'pong' })

    expect(received).toHaveLength(0)
  })

  it('reconnects with backoff after an unexpected close, and stops once connected again', async () => {
    vi.useFakeTimers()
    const statuses: WsConnectionStatus[] = []
    const client = new WsClient({
      getBaseUrl: () => 'ws://localhost:8000',
      getToken: () => Promise.resolve('a-real-token'),
      onStatusChange: (status) => statuses.push(status),
      reconnectDelayMs: 100,
      maxReconnectDelayMs: 500,
    })
    await client.connect('workspace-1')
    expect(FakeWebSocket.instances).toHaveLength(1)

    lastSocket().emitClose()
    expect(statuses.at(-1)).toBe('reconnecting')

    await vi.advanceTimersByTimeAsync(100)
    expect(FakeWebSocket.instances).toHaveLength(2)

    lastSocket().emitMessage({ type: 'connected', workspace_id: 'workspace-1', user_id: 'user-1' })
    expect(statuses.at(-1)).toBe('connected')
  })

  it('disconnect() closes the socket and does not schedule a reconnect', async () => {
    vi.useFakeTimers()
    const statuses: WsConnectionStatus[] = []
    const client = new WsClient({
      getBaseUrl: () => 'ws://localhost:8000',
      getToken: () => Promise.resolve('a-real-token'),
      onStatusChange: (status) => statuses.push(status),
      reconnectDelayMs: 100,
    })
    await client.connect('workspace-1')

    client.disconnect()
    expect(statuses.at(-1)).toBe('disconnected')

    await vi.advanceTimersByTimeAsync(1000)
    expect(FakeWebSocket.instances).toHaveLength(1) // no reconnect attempt happened
  })
})
