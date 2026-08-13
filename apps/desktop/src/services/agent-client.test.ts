import { afterEach, describe, expect, it, vi } from 'vitest'
import { answerAgentQuestion, approveAgentTask, createAgentTask, getAgentTaskSteps } from './agent-client'

describe('agent-client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('createAgentTask posts the agent type/description/model/require_approval and maps the response', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        id: 't1',
        workspace_id: 'ws-1',
        description: 'fix the bug',
        status: 'pending',
        model: 'gpt-4o-mini',
        result: null,
        error: null,
        started_at: null,
        finished_at: null,
        created_at: '2026-01-01T00:00:00Z',
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createAgentTask('tok', 'ws-1', 'coder', 'fix the bug', 'gpt-4o-mini', false)

    expect(result).toMatchObject({ id: 't1', workspaceId: 'ws-1', status: 'pending' })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/agents/tasks',
      expect.objectContaining({
        body: JSON.stringify({
          workspace_id: 'ws-1',
          agent_type: 'coder',
          description: 'fix the bug',
          model: 'gpt-4o-mini',
          require_approval: false,
        }),
      }),
    )
  })

  it('getAgentTaskSteps maps a paginated step list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: 's1',
              index: 0,
              tool: 'read_file',
              args: { path: 'a.py' },
              result: 'contents',
              status: 'completed',
              started_at: null,
              finished_at: null,
            },
          ],
          total: 1,
        }),
      })),
    )

    const steps = await getAgentTaskSteps('tok', 't1')

    expect(steps).toEqual([
      {
        id: 's1',
        index: 0,
        tool: 'read_file',
        args: { path: 'a.py' },
        result: 'contents',
        status: 'completed',
        startedAt: null,
        finishedAt: null,
      },
    ])
  })

  it('approveAgentTask posts the approval decision and resolves without a body on 204', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 204, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(approveAgentTask('tok', 't1', true)).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/agents/tasks/t1/approve',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ approved: true, reason: null }) }),
    )
  })

  it('approveAgentTask includes a denial reason when given one', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 204, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)

    await approveAgentTask('tok', 't1', false, 'wrong file, try b.txt instead')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/agents/tasks/t1/approve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ approved: false, reason: 'wrong file, try b.txt instead' }),
      }),
    )
  })

  it('answerAgentQuestion posts the answer and resolves without a body on 204', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 204, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(answerAgentQuestion('tok', 't1', 'src/utils.ts')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/v1/agents/tasks/t1/answer',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ answer: 'src/utils.ts' }) }),
    )
  })
})
