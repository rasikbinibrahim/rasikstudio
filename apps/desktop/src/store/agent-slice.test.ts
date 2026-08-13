import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './index'
import * as agentClient from '../services/agent-client'
import type { AgentTask } from '../types/agent'

vi.mock('../services/agent-client')

function task(id: string, status: AgentTask['status'] = 'pending'): AgentTask {
  return {
    id,
    workspaceId: 'ws-1',
    description: 'fix the bug',
    status,
    model: 'gpt-4o-mini',
    result: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
  }
}

describe('agent-slice', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useAppStore.setState({
      accessToken: 'tok',
      backendWorkspaceId: 'ws-1',
      agentTasks: [],
      activeAgentTaskId: null,
      agentStepsByTask: {},
      agentPendingApproval: {},
      agentPendingQuestion: {},
      agentError: null,
    })
  })

  it('createAgentTask adds the task and makes it active', async () => {
    vi.mocked(agentClient.createAgentTask).mockResolvedValue(task('t1'))

    await useAppStore.getState().createAgentTask('coder', 'fix the bug', 'gpt-4o-mini')

    expect(useAppStore.getState().agentTasks[0]).toEqual(task('t1'))
    expect(useAppStore.getState().activeAgentTaskId).toBe('t1')
  })

  it('createAgentTask does not call the API for a blank description', async () => {
    await useAppStore.getState().createAgentTask('coder', '   ', 'gpt-4o-mini')

    expect(agentClient.createAgentTask).not.toHaveBeenCalled()
  })

  it('handleAgentStep appends a running step on the first event, then upserts on the result event', () => {
    useAppStore.getState().handleAgentStep('t1', 0, 'read_file', { path: 'a.py' }, null)
    useAppStore.getState().handleAgentStep('t1', 0, 'read_file', { path: 'a.py' }, 'file contents')

    const steps = useAppStore.getState().agentStepsByTask['t1']
    expect(steps).toHaveLength(1)
    expect(steps?.[0]).toMatchObject({ status: 'completed', result: 'file contents' })
  })

  it('handleAgentStep marks a step failed when its result starts with "Error:"', () => {
    useAppStore.getState().handleAgentStep('t1', 0, 'read_file', {}, 'Error: not found')

    expect(useAppStore.getState().agentStepsByTask['t1']?.[0]?.status).toBe('failed')
  })

  it('handleAgentApprovalRequired records the pending prompt and pauses the task', () => {
    useAppStore.setState({ agentTasks: [task('t1', 'running')] })

    useAppStore.getState().handleAgentApprovalRequired('t1', 'delete_file(path=x.py)', 'x.py')

    expect(useAppStore.getState().agentPendingApproval['t1']).toEqual({
      action: 'delete_file(path=x.py)',
      preview: 'x.py',
    })
    expect(useAppStore.getState().agentTasks[0]?.status).toBe('paused')
  })

  it('handleAgentStatusChanged clears the pending approval once the task leaves paused', () => {
    useAppStore.setState({
      agentTasks: [task('t1', 'paused')],
      agentPendingApproval: { t1: { action: 'x', preview: null } },
    })

    useAppStore.getState().handleAgentStatusChanged('t1', 'running')

    expect(useAppStore.getState().agentPendingApproval['t1']).toBeUndefined()
    expect(useAppStore.getState().agentTasks[0]?.status).toBe('running')
  })

  it('handleAgentQuestionAsked records the pending question and pauses the task', () => {
    useAppStore.setState({ agentTasks: [task('t1', 'running')] })

    useAppStore.getState().handleAgentQuestionAsked('t1', 'Which file should I edit?')

    expect(useAppStore.getState().agentPendingQuestion['t1']).toEqual({
      question: 'Which file should I edit?',
    })
    expect(useAppStore.getState().agentTasks[0]?.status).toBe('paused')
  })

  it('handleAgentStatusChanged clears the pending question once the task leaves paused', () => {
    useAppStore.setState({
      agentTasks: [task('t1', 'paused')],
      agentPendingQuestion: { t1: { question: 'Which file?' } },
    })

    useAppStore.getState().handleAgentStatusChanged('t1', 'running')

    expect(useAppStore.getState().agentPendingQuestion['t1']).toBeUndefined()
  })

  it('answerAgentQuestion optimistically clears the pending question before the request resolves', async () => {
    useAppStore.setState({ agentPendingQuestion: { t1: { question: 'Which file?' } } })
    vi.mocked(agentClient.answerAgentQuestion).mockResolvedValue(undefined)

    await useAppStore.getState().answerAgentQuestion('t1', 'src/utils.ts')

    expect(useAppStore.getState().agentPendingQuestion['t1']).toBeUndefined()
    expect(agentClient.answerAgentQuestion).toHaveBeenCalledWith('tok', 't1', 'src/utils.ts')
  })

  it('answerAgentQuestion does not call the API for a blank answer', async () => {
    useAppStore.setState({ agentPendingQuestion: { t1: { question: 'Which file?' } } })

    await useAppStore.getState().answerAgentQuestion('t1', '   ')

    expect(agentClient.answerAgentQuestion).not.toHaveBeenCalled()
  })

  it('answerAgentQuestion records an error on failure', async () => {
    useAppStore.setState({ agentPendingQuestion: { t1: { question: 'Which file?' } } })
    vi.mocked(agentClient.answerAgentQuestion).mockRejectedValue(new Error('already resolved'))

    await useAppStore.getState().answerAgentQuestion('t1', 'src/utils.ts')

    expect(useAppStore.getState().agentError).toBe('already resolved')
  })

  it('answerAgentQuestion does nothing when signed out', async () => {
    useAppStore.setState({ accessToken: null, agentPendingQuestion: { t1: { question: 'x' } } })

    await useAppStore.getState().answerAgentQuestion('t1', 'src/utils.ts')

    expect(agentClient.answerAgentQuestion).not.toHaveBeenCalled()
  })

  it('approveAgentTask optimistically clears the pending prompt before the request resolves', async () => {
    useAppStore.setState({ agentPendingApproval: { t1: { action: 'x', preview: null } } })
    vi.mocked(agentClient.approveAgentTask).mockResolvedValue(undefined)

    await useAppStore.getState().approveAgentTask('t1', true)

    expect(useAppStore.getState().agentPendingApproval['t1']).toBeUndefined()
    expect(agentClient.approveAgentTask).toHaveBeenCalledWith('tok', 't1', true, undefined)
  })

  it('approveAgentTask forwards a denial reason to the API client', async () => {
    useAppStore.setState({ agentPendingApproval: { t1: { action: 'x', preview: null } } })
    vi.mocked(agentClient.approveAgentTask).mockResolvedValue(undefined)

    await useAppStore.getState().approveAgentTask('t1', false, 'wrong file, try b.txt instead')

    expect(agentClient.approveAgentTask).toHaveBeenCalledWith(
      'tok',
      't1',
      false,
      'wrong file, try b.txt instead',
    )
  })

  it('handleAgentCompleted marks the task completed with its summary', () => {
    useAppStore.setState({ agentTasks: [task('t1', 'running')] })

    useAppStore.getState().handleAgentCompleted('t1', 'Done: added the fix')

    expect(useAppStore.getState().agentTasks[0]).toMatchObject({
      status: 'completed',
      result: 'Done: added the fix',
    })
  })

  it('handleAgentFailed marks the task failed with its error', () => {
    useAppStore.setState({ agentTasks: [task('t1', 'running')] })

    useAppStore.getState().handleAgentFailed('t1', 'exceeded 30 iterations')

    expect(useAppStore.getState().agentTasks[0]).toMatchObject({
      status: 'failed',
      error: 'exceeded 30 iterations',
    })
  })

  it('handleAgentStarted marks the task running', () => {
    useAppStore.setState({ agentTasks: [task('t1', 'pending')] })

    useAppStore.getState().handleAgentStarted('t1')

    expect(useAppStore.getState().agentTasks[0]?.status).toBe('running')
  })

  it('loadAgentTasks fetches and stores the workspace task list', async () => {
    vi.mocked(agentClient.listAgentTasks).mockResolvedValue([task('t1'), task('t2')])

    await useAppStore.getState().loadAgentTasks()

    expect(agentClient.listAgentTasks).toHaveBeenCalledWith('tok', 'ws-1')
    expect(useAppStore.getState().agentTasks.map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('loadAgentTasks records an error on failure', async () => {
    vi.mocked(agentClient.listAgentTasks).mockRejectedValue(new Error('network down'))

    await useAppStore.getState().loadAgentTasks()

    expect(useAppStore.getState().agentError).toBe('network down')
  })

  it('loadAgentTasks does nothing when signed out', async () => {
    useAppStore.setState({ accessToken: null })

    await useAppStore.getState().loadAgentTasks()

    expect(agentClient.listAgentTasks).not.toHaveBeenCalled()
  })

  it('selectAgentTask activates the task immediately and fetches its steps', async () => {
    vi.mocked(agentClient.getAgentTaskSteps).mockResolvedValue([])

    await useAppStore.getState().selectAgentTask('t1')

    expect(useAppStore.getState().activeAgentTaskId).toBe('t1')
    expect(agentClient.getAgentTaskSteps).toHaveBeenCalledWith('tok', 't1')
    expect(useAppStore.getState().agentStepsByTask['t1']).toEqual([])
  })

  it('selectAgentTask does not re-fetch steps already loaded for that task', async () => {
    useAppStore.setState({ agentStepsByTask: { t1: [] } })

    await useAppStore.getState().selectAgentTask('t1')

    expect(agentClient.getAgentTaskSteps).not.toHaveBeenCalled()
  })

  it('selectAgentTask records an error when fetching steps fails', async () => {
    vi.mocked(agentClient.getAgentTaskSteps).mockRejectedValue(new Error('boom'))

    await useAppStore.getState().selectAgentTask('t1')

    expect(useAppStore.getState().agentError).toBe('boom')
  })

  it('cancelAgentTask calls the API', async () => {
    vi.mocked(agentClient.cancelAgentTask).mockResolvedValue(undefined)

    await useAppStore.getState().cancelAgentTask('t1')

    expect(agentClient.cancelAgentTask).toHaveBeenCalledWith('tok', 't1')
  })

  it('cancelAgentTask records an error on failure', async () => {
    vi.mocked(agentClient.cancelAgentTask).mockRejectedValue(new Error('already finished'))

    await useAppStore.getState().cancelAgentTask('t1')

    expect(useAppStore.getState().agentError).toBe('already finished')
  })

  it('cancelAgentTask does nothing when signed out', async () => {
    useAppStore.setState({ accessToken: null })

    await useAppStore.getState().cancelAgentTask('t1')

    expect(agentClient.cancelAgentTask).not.toHaveBeenCalled()
  })

  it('approveAgentTask records an error on failure', async () => {
    useAppStore.setState({ agentPendingApproval: { t1: { action: 'write_file', preview: null } } })
    vi.mocked(agentClient.approveAgentTask).mockRejectedValue(new Error('already resolved'))

    await useAppStore.getState().approveAgentTask('t1', true)

    expect(useAppStore.getState().agentError).toBe('already resolved')
  })
})
