import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '../../store'
import { commandRegistry } from './CommandRegistry'
import { CommandPalette } from './CommandPalette'

describe('CommandPalette', () => {
  const registeredIds: string[] = []

  beforeEach(() => {
    useAppStore.setState({
      allFiles: ['src/App.tsx', 'src/main.tsx', 'README.md'],
      openFile: vi.fn(async () => undefined),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    for (const id of registeredIds.splice(0)) commandRegistry.unregister(id)
  })

  it('files mode: filters the workspace file list by fuzzy match', async () => {
    render(
      <CommandPalette open mode="files" query="App" onQueryChange={vi.fn()} onClose={vi.fn()} />,
    )

    expect(screen.getByText('src/App.tsx')).toBeInTheDocument()
    expect(screen.queryByText('README.md')).not.toBeInTheDocument()
  })

  it('files mode: clicking a result opens the file and closes the palette', async () => {
    const openFile = vi.fn(async () => undefined)
    const onClose = vi.fn()
    useAppStore.setState({ openFile })
    render(<CommandPalette open mode="files" query="" onQueryChange={vi.fn()} onClose={onClose} />)

    await userEvent.click(screen.getByText('src/App.tsx'))

    expect(openFile).toHaveBeenCalledWith('src/App.tsx')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('commands mode: the leading ">" is stripped before matching, not treated as search text', () => {
    const run = vi.fn()
    commandRegistry.register({ id: 'test.hello', title: 'Say Hello', run })
    registeredIds.push('test.hello')

    render(<CommandPalette open mode="commands" query=">hello" onQueryChange={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('Say Hello')).toBeInTheDocument()
  })

  it('commands mode: selecting a command executes it and closes the palette', async () => {
    const run = vi.fn()
    commandRegistry.register({ id: 'test.hello', title: 'Say Hello', run })
    registeredIds.push('test.hello')
    const onClose = vi.fn()

    render(<CommandPalette open mode="commands" query=">hello" onQueryChange={vi.fn()} onClose={onClose} />)
    await userEvent.click(screen.getByText('Say Hello'))

    expect(run).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows "No results" when nothing matches', () => {
    render(<CommandPalette open mode="files" query="nonexistent-xyz" onQueryChange={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('No results')).toBeInTheDocument()
  })

  it('ArrowDown/ArrowUp move the selection, Enter activates the selected result', async () => {
    const openFile = vi.fn(async () => undefined)
    const onClose = vi.fn()
    useAppStore.setState({ allFiles: ['a.ts', 'b.ts'], openFile })
    render(<CommandPalette open mode="files" query="" onQueryChange={vi.fn()} onClose={onClose} />)

    const input = screen.getByPlaceholderText('Search files by name…')
    await userEvent.type(input, '{ArrowDown}{Enter}')

    expect(openFile).toHaveBeenCalledWith('b.ts')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('ArrowUp does not move above the first result', async () => {
    const openFile = vi.fn(async () => undefined)
    useAppStore.setState({ allFiles: ['a.ts', 'b.ts'], openFile })
    render(<CommandPalette open mode="files" query="" onQueryChange={vi.fn()} onClose={vi.fn()} />)

    const input = screen.getByPlaceholderText('Search files by name…')
    await userEvent.type(input, '{ArrowUp}{Enter}')

    expect(openFile).toHaveBeenCalledWith('a.ts')
  })

  it('resets the selection back to the first result whenever the query changes', () => {
    useAppStore.setState({ allFiles: ['a.ts', 'b.ts'] })
    const { rerender } = render(
      <CommandPalette open mode="files" query="" onQueryChange={vi.fn()} onClose={vi.fn()} />,
    )
    rerender(<CommandPalette open mode="files" query="b" onQueryChange={vi.fn()} onClose={vi.fn()} />)

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
  })
})
