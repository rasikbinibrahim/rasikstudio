import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useAppStore } from '../../store'
import { AgentStepTimeline } from './AgentStepTimeline'
import type { AgentTask, AgentTaskStep } from '../../types/agent'

function task(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 't1',
    workspaceId: 'w1',
    description: 'Task',
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

function step(overrides: Partial<AgentTaskStep> = {}): AgentTaskStep {
  return {
    id: 'step1',
    index: 0,
    tool: 'read_file',
    args: {},
    result: null,
    status: 'completed',
    startedAt: null,
    finishedAt: null,
    ...overrides,
  }
}

describe('AgentStepTimeline', () => {
  beforeEach(() => {
    useAppStore.setState({ agentStepsByTask: {}, agentPendingApproval: {} })
  })

  it('shows a waiting message for a pending task with no steps yet', () => {
    render(<AgentStepTimeline task={task({ status: 'pending' })} />)
    expect(screen.getByText('Waiting for the agent to start…')).toBeInTheDocument()
  })

  it('shows a generic empty message for a running task with no steps yet', () => {
    render(<AgentStepTimeline task={task({ status: 'running' })} />)
    expect(screen.getByText('No tool calls yet.')).toBeInTheDocument()
  })

  it('renders every step, ordered by index, with its tool name and args', () => {
    useAppStore.setState({
      agentStepsByTask: {
        t1: [
          step({ id: 's2', index: 1, tool: 'write_file', args: { path: 'a.txt' } }),
          step({ id: 's1', index: 0, tool: 'read_file', args: { path: 'b.txt' } }),
        ],
      },
    })
    render(<AgentStepTimeline task={task()} />)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('read_file')
    expect(items[1]).toHaveTextContent('write_file')
  })

  it('renders a plain result as text', () => {
    useAppStore.setState({
      agentStepsByTask: { t1: [step({ result: 'file contents here' })] },
    })
    render(<AgentStepTimeline task={task()} />)

    expect(screen.getByText('file contents here')).toBeInTheDocument()
  })

  it('renders a browser_screenshot result as an image instead of raw text', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgo='
    useAppStore.setState({
      agentStepsByTask: { t1: [step({ tool: 'browser_screenshot', result: dataUri })] },
    })
    render(<AgentStepTimeline task={task()} />)

    expect(screen.getByRole('img', { name: 'Agent browser screenshot' })).toHaveAttribute('src', dataUri)
    expect(screen.queryByText(dataUri)).not.toBeInTheDocument()
  })

  it('shows the task error for a failed task', () => {
    render(<AgentStepTimeline task={task({ status: 'failed', error: 'guard: max iterations exceeded' })} />)
    expect(screen.getByText('guard: max iterations exceeded')).toBeInTheDocument()
  })

  it('shows the task result for a completed task', () => {
    render(<AgentStepTimeline task={task({ status: 'completed', result: 'All done.' })} />)
    expect(screen.getByText('All done.')).toBeInTheDocument()
  })

  it('renders the approval prompt for this task when one is pending', () => {
    useAppStore.setState({ agentPendingApproval: { t1: { action: 'write_file: a.txt', preview: null } } })
    render(<AgentStepTimeline task={task()} />)

    expect(screen.getByText('Approval required')).toBeInTheDocument()
  })
})
