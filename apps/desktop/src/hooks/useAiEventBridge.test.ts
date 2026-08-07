import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAppStore } from '../store'
import { useAiEventBridge } from './useAiEventBridge'
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
    emit: (eventType: string, event: Record<string, unknown>) => {
      for (const handler of handlers.get(eventType) ?? []) handler(event as unknown as WsEvent)
    },
  }
}

describe('useAiEventBridge', () => {
  let client: ReturnType<typeof fakeWsClient>
  const handleStreamChunk = vi.fn()
  const handleStreamEnd = vi.fn()
  const handleAgentStarted = vi.fn()
  const handleAgentStep = vi.fn()
  const handleAgentApprovalRequired = vi.fn()
  const handleAgentStatusChanged = vi.fn()
  const handleAgentCompleted = vi.fn()
  const handleAgentFailed = vi.fn()

  beforeEach(() => {
    client = fakeWsClient()
    useAppStore.setState({
      wsClient: client as unknown as never,
      handleStreamChunk,
      handleStreamEnd,
      handleAgentStarted,
      handleAgentStep,
      handleAgentApprovalRequired,
      handleAgentStatusChanged,
      handleAgentCompleted,
      handleAgentFailed,
    })
    for (const fn of [
      handleStreamChunk,
      handleStreamEnd,
      handleAgentStarted,
      handleAgentStep,
      handleAgentApprovalRequired,
      handleAgentStatusChanged,
      handleAgentCompleted,
      handleAgentFailed,
    ]) {
      fn.mockClear()
    }
  })

  it('subscribes to every stream/agent event type on mount', () => {
    renderHook(() => useAiEventBridge())

    const subscribed = client.on.mock.calls.map((call) => call[0])
    expect(subscribed).toEqual(
      expect.arrayContaining([
        'stream_chunk',
        'stream_end',
        'agent_started',
        'agent_step',
        'agent_approval_required',
        'agent_status_changed',
        'agent_completed',
        'agent_failed',
      ]),
    )
  })

  it('dispatches stream_chunk to handleStreamChunk with message_id and delta', () => {
    renderHook(() => useAiEventBridge())

    client.emit('stream_chunk', { message_id: 'm1', delta: 'hello' })

    expect(handleStreamChunk).toHaveBeenCalledWith('m1', 'hello')
  })

  it('dispatches agent_step to handleAgentStep with all its fields, defaulting a missing result to null', () => {
    renderHook(() => useAiEventBridge())

    client.emit('agent_step', {
      task_id: 't1',
      step_index: 2,
      tool: 'read_file',
      args: { path: 'a.txt' },
    })

    expect(handleAgentStep).toHaveBeenCalledWith('t1', 2, 'read_file', { path: 'a.txt' }, null)
  })

  it('dispatches agent_completed to handleAgentCompleted with task_id and summary', () => {
    renderHook(() => useAiEventBridge())

    client.emit('agent_completed', { task_id: 't1', summary: 'done' })

    expect(handleAgentCompleted).toHaveBeenCalledWith('t1', 'done')
  })

  it('dispatches agent_failed to handleAgentFailed with task_id and error', () => {
    renderHook(() => useAiEventBridge())

    client.emit('agent_failed', { task_id: 't1', error: 'boom' })

    expect(handleAgentFailed).toHaveBeenCalledWith('t1', 'boom')
  })
})
