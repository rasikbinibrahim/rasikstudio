import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useAppStore } from '../../store'
import { TerminalPanel } from './TerminalPanel'

vi.mock('./useTerminal', () => ({
  useTerminal: () => ({ containerRef: { current: null } }),
}))

describe('TerminalPanel', () => {
  beforeEach(() => {
    useAppStore.setState({ terminals: [], activeTerminalId: null })
  })

  it('shows a hint to start a terminal when none are open', () => {
    render(<TerminalPanel />)
    expect(screen.getByText('No terminal open — click + to start one')).toBeInTheDocument()
  })

  it('renders a tab for every open terminal', () => {
    useAppStore.setState({
      terminals: [
        { id: 't1', title: 'Terminal 1', cwd: '', status: 'active' },
        { id: 't2', title: 'Terminal 2', cwd: '', status: 'active' },
      ],
      activeTerminalId: 't1',
    })
    const { container } = render(<TerminalPanel />)

    expect(container.querySelectorAll('[style*="display"]')).toHaveLength(2)
  })

  it('does not show the empty-state hint once a terminal is open', () => {
    useAppStore.setState({
      terminals: [{ id: 't1', title: 'Terminal 1', cwd: '', status: 'active' }],
      activeTerminalId: 't1',
    })
    render(<TerminalPanel />)

    expect(screen.queryByText('No terminal open — click + to start one')).not.toBeInTheDocument()
  })
})
