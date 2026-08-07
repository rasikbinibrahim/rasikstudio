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

  it('approveAgentTask optimistically clears the pending prompt before the request resolves', async () => {
    useAppStore.setState({ agentPendingApproval: { t1: { action: 'x', preview: null } } })
    vi.mocked(agentClient.approveAgentTask).mockResolvedValue(undefined)

    await useAppStore.getState().approveAgentTask('t1', true)

    expect(useAppStore.getState().agentPendingApproval['t1']).toBeUndefined()
    expect(agentClient.approveAgentTask).toHaveBeenCalledWith('tok', 't1', true)
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
})
