import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '../../store'
import { AgentTaskList } from './AgentTaskList'
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

describe('AgentTaskList', () => {
  beforeEach(() => {
    useAppStore.setState({ agentTasks: [], activeAgentTaskId: null })
  })

  it('disables Run until a description is entered', () => {
    render(<AgentTaskList />)
    expect(screen.getByRole('button', { name: 'Run agent task' })).toBeDisabled()
  })

  it('creates a task with the entered description, agent type, and model', async () => {
    const createAgentTask = vi.fn()
    useAppStore.setState({ createAgentTask })
    render(<AgentTaskList />)

    await userEvent.type(
      screen.getByPlaceholderText(/Describe the task/),
      'Add input validation to the login form',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Run agent task' }))

    expect(createAgentTask).toHaveBeenCalledWith('coder', 'Add input validation to the login form', 'claude-sonnet-4-5')
  })

  it('clears the description after creating a task', async () => {
    useAppStore.setState({ createAgentTask: vi.fn() })
    render(<AgentTaskList />)
    const textarea = screen.getByPlaceholderText(/Describe the task/)

    await userEvent.type(textarea, 'Do a thing')
    await userEvent.click(screen.getByRole('button', { name: 'Run agent task' }))

    expect(textarea).toHaveValue('')
  })

  it('lists every task with its status, and highlights the active one', () => {
    useAppStore.setState({
      agentTasks: [task({ id: 't1', description: 'Task one', status: 'completed' }), task({ id: 't2', description: 'Task two', status: 'failed' })],
      activeAgentTaskId: 't2',
    })
    render(<AgentTaskList />)

    expect(screen.getByText('Task one')).toBeInTheDocument()
    expect(screen.getByText('completed')).toBeInTheDocument()
    expect(screen.getByText('failed')).toBeInTheDocument()
    expect(screen.getByText('Task two').closest('button')).toHaveClass('bg-bg-active')
  })

  it('selects a task when it is clicked', async () => {
    const selectAgentTask = vi.fn()
    useAppStore.setState({ agentTasks: [task()], selectAgentTask })
    render(<AgentTaskList />)

    await userEvent.click(screen.getByText('Add input validation'))

    expect(selectAgentTask).toHaveBeenCalledWith('t1')
  })
})
