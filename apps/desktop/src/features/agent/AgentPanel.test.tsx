import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '../../store'
import { AgentPanel } from './AgentPanel'
import type { AgentTask } from '../../types/agent'

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 't1',
    workspaceId: 'w1',
    description: 'Add input validation',
    status: 'running',
    model: 'gpt-4o-mini',
    result: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-08-07T00:00:00Z',
    ...overrides,
  }
}

describe('AgentPanel', () => {
  beforeEach(() => {
    useAppStore.setState({
      workspaceRoot: '/ws',
      user: { id: 'u1', email: 'dev@example.com', name: 'Dev' },
      backendWorkspaceId: 'bw1',
      loadAgentTasks: vi.fn(async () => undefined),
      agentTasks: [],
      activeAgentTaskId: null,
      agentStepsByTask: {},
      agentPendingApproval: {},
      agentError: null,
    })
  })

  it('prompts to open a folder first when no workspace is open', () => {
    useAppStore.setState({ workspaceRoot: null })
    render(<AgentPanel />)
    expect(screen.getByText(/Open a folder first/)).toBeInTheDocument()
  })

  it('prompts to sign in when signed out', async () => {
    const openAuthDialog = vi.fn()
    useAppStore.setState({ user: null, openAuthDialog })
    render(<AgentPanel />)

    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))
    expect(openAuthDialog).toHaveBeenCalledOnce()
  })

  it('shows a connecting message while the backend workspace sync has not resolved yet', () => {
    useAppStore.setState({ backendWorkspaceId: null })
    render(<AgentPanel />)
    expect(screen.getByText(/Connecting this workspace to the backend/)).toBeInTheDocument()
  })

  it('loads agent tasks once ready', async () => {
    const loadAgentTasks = vi.fn(async () => undefined)
    useAppStore.setState({ loadAgentTasks })
    render(<AgentPanel />)

    await waitFor(() => expect(loadAgentTasks).toHaveBeenCalledOnce())
  })

  it('prompts to describe a task when none is selected', () => {
    render(<AgentPanel />)
    expect(screen.getByText('Describe a task above and click Run, or select a task from the list.')).toBeInTheDocument()
  })

  it('shows the active task description and its step timeline', () => {
    useAppStore.setState({ agentTasks: [task()], activeAgentTaskId: 't1' })
    render(<AgentPanel />)

    // Appears twice — once in the task list entry, once in the active-task header — so this
    // asserts at least one match exists rather than picking a single element.
    expect(screen.getAllByText('Add input validation').length).toBeGreaterThan(0)
    expect(screen.getByText('No tool calls yet.')).toBeInTheDocument()
  })

  it('shows a Cancel button for a running task, and calls cancelAgentTask when clicked', async () => {
    const cancelAgentTask = vi.fn()
    useAppStore.setState({ agentTasks: [task({ status: 'running' })], activeAgentTaskId: 't1', cancelAgentTask })
    render(<AgentPanel />)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(cancelAgentTask).toHaveBeenCalledWith('t1')
  })

  it('does not show a Cancel button for a completed task', () => {
    useAppStore.setState({ agentTasks: [task({ status: 'completed' })], activeAgentTaskId: 't1' })
    render(<AgentPanel />)

    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('shows the agent error banner when set', () => {
    useAppStore.setState({ agentError: 'Failed to create task' })
    render(<AgentPanel />)
    expect(screen.getByText('Failed to create task')).toBeInTheDocument()
  })
})
