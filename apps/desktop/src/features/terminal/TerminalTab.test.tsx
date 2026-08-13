import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TerminalTab } from './TerminalTab'

const findNextMock = vi.fn(() => true)
const findPreviousMock = vi.fn(() => true)
const useTerminalMock = vi.fn((terminalId: string) => ({
  containerRef: { current: null },
  terminalId,
  findNext: findNextMock,
  findPrevious: findPreviousMock,
}))
vi.mock('./useTerminal', () => ({
  useTerminal: (terminalId: string) => useTerminalMock(terminalId),
}))

describe('TerminalTab', () => {
  it('mounts the xterm.js instance for the given terminal id', () => {
    render(<TerminalTab terminalId="t1" visible />)
    expect(useTerminalMock).toHaveBeenCalledWith('t1')
  })

  it('is visible when visible is true', () => {
    const { container } = render(<TerminalTab terminalId="t1" visible />)
    expect(container.firstChild).toHaveStyle({ display: 'block' })
  })

  it('is hidden (not unmounted) when visible is false, preserving scrollback', () => {
    const { container } = render(<TerminalTab terminalId="t1" visible={false} />)
    expect(container.firstChild).toHaveStyle({ display: 'none' })
  })

  describe('in-terminal search (SearchAddon, previously loaded but unreachable from any UI)', () => {
    function openSearch(container: HTMLElement): void {
      fireEvent.keyDown(container.firstChild as HTMLElement, { key: 'f', ctrlKey: true })
    }

    it('Ctrl+F opens the search bar', () => {
      const { container } = render(<TerminalTab terminalId="t1" visible />)
      expect(screen.queryByPlaceholderText('Find in terminal')).not.toBeInTheDocument()

      openSearch(container)

      expect(screen.getByPlaceholderText('Find in terminal')).toBeInTheDocument()
    })

    it('Enter calls findNext with the typed query', async () => {
      const { container } = render(<TerminalTab terminalId="t1" visible />)
      openSearch(container)

      await userEvent.type(screen.getByPlaceholderText('Find in terminal'), 'error{Enter}')

      expect(findNextMock).toHaveBeenCalledWith('error')
    })

    it('Shift+Enter calls findPrevious instead', async () => {
      const { container } = render(<TerminalTab terminalId="t1" visible />)
      openSearch(container)

      await userEvent.type(screen.getByPlaceholderText('Find in terminal'), 'error{Shift>}{Enter}{/Shift}')

      expect(findPreviousMock).toHaveBeenCalledWith('error')
    })

    it('Escape closes the search bar and clears the query', async () => {
      const { container } = render(<TerminalTab terminalId="t1" visible />)
      openSearch(container)
      const input = screen.getByPlaceholderText('Find in terminal')
      await userEvent.type(input, 'error')

      fireEvent.keyDown(input, { key: 'Escape' })

      expect(screen.queryByPlaceholderText('Find in terminal')).not.toBeInTheDocument()
    })

    it('the close button closes the search bar', async () => {
      const { container } = render(<TerminalTab terminalId="t1" visible />)
      openSearch(container)

      await userEvent.click(screen.getByRole('button', { name: 'Close search' }))

      expect(screen.queryByPlaceholderText('Find in terminal')).not.toBeInTheDocument()
    })
  })
})
