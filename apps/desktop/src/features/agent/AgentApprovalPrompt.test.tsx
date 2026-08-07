import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '../../store'
import { AgentApprovalPrompt } from './AgentApprovalPrompt'

describe('AgentApprovalPrompt', () => {
  beforeEach(() => {
    useAppStore.setState({ agentPendingApproval: {} })
  })

  it('renders nothing when there is no pending approval for this task', () => {
    const { container } = render(<AgentApprovalPrompt taskId="t1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the pending action and its preview', () => {
    useAppStore.setState({
      agentPendingApproval: { t1: { action: 'write_file: src/App.tsx', preview: 'diff preview' } },
    })
    render(<AgentApprovalPrompt taskId="t1" />)

    expect(screen.getByText('write_file: src/App.tsx')).toBeInTheDocument()
    expect(screen.getByText('diff preview')).toBeInTheDocument()
  })

  it('omits the preview block when there is none', () => {
    useAppStore.setState({ agentPendingApproval: { t1: { action: 'run_command: rm -rf x', preview: null } } })
    render(<AgentApprovalPrompt taskId="t1" />)

    expect(screen.queryByRole('presentation')).not.toBeInTheDocument()
  })

  it('approves the pending action', async () => {
    const approveAgentTask = vi.fn()
    useAppStore.setState({
      agentPendingApproval: { t1: { action: 'write_file', preview: null } },
      approveAgentTask,
    })
    render(<AgentApprovalPrompt taskId="t1" />)

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(approveAgentTask).toHaveBeenCalledWith('t1', true)
  })

  it('denies the pending action', async () => {
    const approveAgentTask = vi.fn()
    useAppStore.setState({
      agentPendingApproval: { t1: { action: 'write_file', preview: null } },
      approveAgentTask,
    })
    render(<AgentApprovalPrompt taskId="t1" />)

    await userEvent.click(screen.getByRole('button', { name: 'Deny' }))

    expect(approveAgentTask).toHaveBeenCalledWith('t1', false)
  })

  it('only shows the approval for the matching task id', () => {
    useAppStore.setState({ agentPendingApproval: { other: { action: 'x', preview: null } } })
    const { container } = render(<AgentApprovalPrompt taskId="t1" />)
    expect(container).toBeEmptyDOMElement()
  })
})
