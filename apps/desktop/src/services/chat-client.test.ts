import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChatSession, getChatSession, sendChatMessage } from './chat-client'

describe('chat-client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('createChatSession posts the workspace/model/title and maps the snake_case response', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        id: 's1',
        workspace_id: 'ws-1',
        title: 'New Chat',
        model: 'gpt-4o-mini',
        system_prompt: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createChatSession('tok', 'ws-1', 'gpt-4o-mini', 'New Chat')

    expect(result).toEqual({
      id: 's1',
      workspaceId: 'ws-1',
      title: 'New Chat',
      model: 'gpt-4o-mini',
      systemPrompt: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/chat/sessions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
        body: JSON.stringify({ workspace_id: 'ws-1', model: 'gpt-4o-mini', title: 'New Chat' }),
      }),
    )
  })

  it('getChatSession maps both the session and its history', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          session: {
            id: 's1',
            workspace_id: 'ws-1',
            title: 'New Chat',
            model: 'gpt-4o-mini',
            system_prompt: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
          history: [
            {
              id: 'm1',
              session_id: 's1',
              role: 'user',
              content: 'hi',
              finish_reason: null,
              model: null,
              created_at: '2026-01-01T00:00:00Z',
            },
          ],
        }),
      })),
    )

    const result = await getChatSession('tok', 's1')

    expect(result.session.workspaceId).toBe('ws-1')
    expect(result.history).toEqual([
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
    ])
  })

  it('sendChatMessage sends null for active_file when none is attached', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        id: 'm1',
        session_id: 's1',
        role: 'user',
        content: 'hello',
        finish_reason: null,
        model: null,
        created_at: '2026-01-01T00:00:00Z',
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    await sendChatMessage('tok', 's1', 'hello', null)

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/chat/sessions/s1/messages',
      expect.objectContaining({
        body: JSON.stringify({ content: 'hello', active_file: null, include_git_diff: false }),
      }),
    )
  })

  it('sends include_git_diff: true when the caller opts in', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        id: 'm1',
        session_id: 's1',
        role: 'user',
        content: 'what changed?',
        finish_reason: null,
        model: null,
        created_at: '2026-01-01T00:00:00Z',
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    await sendChatMessage('tok', 's1', 'what changed?', null, true)

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/chat/sessions/s1/messages',
      expect.objectContaining({
        body: JSON.stringify({ content: 'what changed?', active_file: null, include_git_diff: true }),
      }),
    )
  })

  it('throws with the backend error message on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'Chat session not found' } }),
      })),
    )

    await expect(getChatSession('tok', 'missing')).rejects.toThrow('Chat session not found')
  })
})
