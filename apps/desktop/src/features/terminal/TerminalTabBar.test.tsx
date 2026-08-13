import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '../../store'
import { TerminalTabBar } from './TerminalTabBar'

describe('TerminalTabBar', () => {
  beforeEach(() => {
    useAppStore.setState({ terminals: [], activeTerminalId: null })
  })

  it('renders a tab per terminal', () => {
    useAppStore.setState({
      terminals: [
        { id: 't1', title: 'Terminal 1', cwd: '', status: 'active' },
        { id: 't2', title: 'Terminal 2', cwd: '', status: 'active' },
      ],
      activeTerminalId: 't1',
    })
    render(<TerminalTabBar />)

    expect(screen.getByText('Terminal 1')).toBeInTheDocument()
    expect(screen.getByText('Terminal 2')).toBeInTheDocument()
  })

  it('marks an exited terminal in its tab label', () => {
    useAppStore.setState({ terminals: [{ id: 't1', title: 'Terminal 1', cwd: '', status: 'exited' }] })
    render(<TerminalTabBar />)

    expect(screen.getByText('Terminal 1 (exited)')).toBeInTheDocument()
  })

  it('switches the active terminal when a tab is clicked', async () => {
    const setActiveTerminal = vi.fn()
    useAppStore.setState({
      terminals: [
        { id: 't1', title: 'Terminal 1', cwd: '', status: 'active' },
        { id: 't2', title: 'Terminal 2', cwd: '', status: 'active' },
      ],
      activeTerminalId: 't1',
      setActiveTerminal,
    })
    render(<TerminalTabBar />)

    await userEvent.click(screen.getByText('Terminal 2'))

    expect(setActiveTerminal).toHaveBeenCalledWith('t2')
  })

  it('closes a terminal via its tab close button', async () => {
    const closeTerminal = vi.fn()
    useAppStore.setState({ terminals: [{ id: 't1', title: 'Terminal 1', cwd: '', status: 'active' }], closeTerminal })
    render(<TerminalTabBar />)

    await userEvent.click(screen.getByRole('button', { name: 'Close Terminal 1' }))

    expect(closeTerminal).toHaveBeenCalledWith('t1')
  })

  it('creates a new terminal when the + button is clicked', async () => {
    const createTerminal = vi.fn()
    useAppStore.setState({ createTerminal })
    render(<TerminalTabBar />)

    await userEvent.click(screen.getByRole('button', { name: 'New Terminal' }))

    expect(createTerminal).toHaveBeenCalledOnce()
  })
})
