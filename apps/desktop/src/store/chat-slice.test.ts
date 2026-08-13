import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './index'
import * as chatClient from '../services/chat-client'
import type { ChatSession } from '../types/chat'

vi.mock('../services/chat-client')

function session(id: string): ChatSession {
  return {
    id,
    workspaceId: 'ws-1',
    title: 'New Chat',
    model: 'gpt-4o-mini',
    systemPrompt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

describe('chat-slice', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
    useAppStore.setState({
      accessToken: 'tok',
      backendWorkspaceId: 'ws-1',
      chatSessions: [],
      activeChatSessionId: null,
      chatMessagesBySession: {},
      chatError: null,
    })
  })

  it('loadChatSessions is a no-op without a signed-in user or a synced workspace', async () => {
    useAppStore.setState({ accessToken: null })

    await useAppStore.getState().loadChatSessions()

    expect(chatClient.listChatSessions).not.toHaveBeenCalled()
  })

  it('loadChatSessions populates chatSessions on success', async () => {
    vi.mocked(chatClient.listChatSessions).mockResolvedValue([session('s1')])

    await useAppStore.getState().loadChatSessions()

    expect(useAppStore.getState().chatSessions).toEqual([session('s1')])
    expect(chatClient.listChatSessions).toHaveBeenCalledWith('tok', 'ws-1')
  })

  it('loadChatSessions records the error message on failure instead of throwing', async () => {
    vi.mocked(chatClient.listChatSessions).mockRejectedValue(new Error('boom'))

    await useAppStore.getState().loadChatSessions()

    expect(useAppStore.getState().chatError).toBe('boom')
  })

  it('createChatSession adds the new session and makes it active', async () => {
    vi.mocked(chatClient.createChatSession).mockResolvedValue(session('s2'))

    await useAppStore.getState().createChatSession('gpt-4o-mini')

    expect(useAppStore.getState().chatSessions[0]).toEqual(session('s2'))
    expect(useAppStore.getState().activeChatSessionId).toBe('s2')
    expect(useAppStore.getState().chatMessagesBySession['s2']).toEqual([])
  })

  it('selectChatSession fetches history only the first time a session is opened', async () => {
    vi.mocked(chatClient.getChatSession).mockResolvedValue({
      session: session('s1'),
      history: [
        {
          id: 'm1',
          sessionId: 's1',
          role: 'user',
          content: 'hi',
          finishReason: null,
          model: null,
          createdAt: '2026-01-01T00:00:00Z',
          streaming: false,
        },
      ],
    })

    await useAppStore.getState().selectChatSession('s1')
    await useAppStore.getState().selectChatSession('s1')

    expect(useAppStore.getState().chatMessagesBySession['s1']).toHaveLength(1)
    expect(chatClient.getChatSession).toHaveBeenCalledOnce()
  })

  it('deleteChatSession removes the session and its messages, falling back to another active session', async () => {
    vi.mocked(chatClient.deleteChatSession).mockResolvedValue(undefined)
    useAppStore.setState({
      chatSessions: [session('s1'), session('s2')],
      activeChatSessionId: 's1',
      chatMessagesBySession: { s1: [], s2: [] },
    })

    await useAppStore.getState().deleteChatSession('s1')

    expect(useAppStore.getState().chatSessions.map((s) => s.id)).toEqual(['s2'])
    expect(useAppStore.getState().chatMessagesBySession['s1']).toBeUndefined()
    expect(useAppStore.getState().activeChatSessionId).toBe('s2')
  })

  it('sendChatMessage appends the persisted user message to the active session', async () => {
    useAppStore.setState({ activeChatSessionId: 's1', chatMessagesBySession: { s1: [] } })
    vi.mocked(chatClient.sendChatMessage).mockResolvedValue({
      id: 'm1',
      sessionId: 's1',
      role: 'user',
      content: 'hello',
      finishReason: null,
      model: null,
      createdAt: '2026-01-01T00:00:00Z',
      streaming: false,
    })

    await useAppStore.getState().sendChatMessage('hello')

    expect(useAppStore.getState().chatMessagesBySession['s1']).toHaveLength(1)
    expect(chatClient.sendChatMessage).toHaveBeenCalledWith('tok', 's1', 'hello', null, false)
  })

  it('sendChatMessage forwards includeGitDiff to the API client', async () => {
    useAppStore.setState({ activeChatSessionId: 's1', chatMessagesBySession: { s1: [] } })
    vi.mocked(chatClient.sendChatMessage).mockResolvedValue({
      id: 'm1',
      sessionId: 's1',
      role: 'user',
      content: 'what changed?',
      finishReason: null,
      model: null,
      createdAt: '2026-01-01T00:00:00Z',
      streaming: false,
    })

    await useAppStore.getState().sendChatMessage('what changed?', undefined, true)

    expect(chatClient.sendChatMessage).toHaveBeenCalledWith('tok', 's1', 'what changed?', null, true)
  })

  it('handleStreamChunk creates a streaming placeholder on the first chunk, then appends deltas', () => {
    useAppStore.setState({ activeChatSessionId: 's1', chatMessagesBySession: { s1: [] } })

    useAppStore.getState().handleStreamChunk('assistant-1', 'Hel')
    useAppStore.getState().handleStreamChunk('assistant-1', 'lo')

    const messages = useAppStore.getState().chatMessagesBySession['s1']
    expect(messages).toHaveLength(1)
    expect(messages?.[0]).toMatchObject({ id: 'assistant-1', role: 'assistant', streaming: true })
    // Batched via requestAnimationFrame (stubbed to run synchronously above) — both chunks land.
    expect(messages?.[0]?.content).toBe('Hello')
  })

  it('handleStreamEnd marks the message no longer streaming and records the finish reason', () => {
    useAppStore.setState({ activeChatSessionId: 's1', chatMessagesBySession: { s1: [] } })
    useAppStore.getState().handleStreamChunk('assistant-1', 'Hi')

    useAppStore.getState().handleStreamEnd('assistant-1', 'stop')

    const message = useAppStore.getState().chatMessagesBySession['s1']?.[0]
    expect(message?.streaming).toBe(false)
    expect(message?.finishReason).toBe('stop')
  })
})
