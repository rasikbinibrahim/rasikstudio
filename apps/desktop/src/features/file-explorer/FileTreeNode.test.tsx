import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileTreeNode } from './FileTreeNode'
import { useAppStore } from '../../store'
import type { FileTreeState } from './useFileTree'
import type { FileTreeEntry } from '../../types/workspace'

function stubRasikApi(overrides: Record<string, unknown> = {}): void {
  ;(window as unknown as { rasik: object }).rasik = {
    files: {
      move: vi.fn(async () => ({ ok: true, data: null })),
      delete: vi.fn(async () => ({ ok: true, data: null })),
    },
    shell: {
      showItemInFolder: vi.fn(async () => ({ ok: true, data: null })),
    },
    ...overrides,
  }
}

function tree(overrides: Partial<FileTreeState> = {}): FileTreeState {
  return {
    rootEntries: [],
    childrenByPath: {},
    expandedPaths: new Set(),
    loadingPaths: new Set(),
    toggleExpand: vi.fn(),
    refreshParentOf: vi.fn(),
    ...overrides,
  }
}

function fileEntry(overrides: Partial<FileTreeEntry> = {}): FileTreeEntry {
  return { name: 'App.tsx', path: 'src/App.tsx', isDirectory: false, ...overrides }
}

describe('FileTreeNode', () => {
  beforeEach(() => {
    stubRasikApi()
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } })
    useAppStore.setState({
      activeFileId: null,
      workspaceRoot: '/ws',
      gitStatus: null,
      openFile: vi.fn(),
      createTerminal: vi.fn(),
      toggleBottomPanel: vi.fn(),
      bottomPanelCollapsed: true,
      renameOpenFile: vi.fn(),
      closeFileByPath: vi.fn(),
    })
  })

  it('renders the entry name', () => {
    render(<FileTreeNode entry={fileEntry()} depth={0} tree={tree()} />)
    expect(screen.getByText('App.tsx')).toBeInTheDocument()
  })

  it('opens the file on click', async () => {
    const openFile = vi.fn()
    useAppStore.setState({ openFile })
    render(<FileTreeNode entry={fileEntry()} depth={0} tree={tree()} />)

    await userEvent.click(screen.getByText('App.tsx'))

    expect(openFile).toHaveBeenCalledWith('src/App.tsx')
  })

  it('toggles expansion on click for a directory instead of opening a file', async () => {
    const toggleExpand = vi.fn()
    const openFile = vi.fn()
    useAppStore.setState({ openFile })
    render(
      <FileTreeNode
        entry={{ name: 'src', path: 'src', isDirectory: true }}
        depth={0}
        tree={tree({ toggleExpand })}
      />,
    )

    await userEvent.click(screen.getByText('src'))

    expect(toggleExpand).toHaveBeenCalledWith('src')
    expect(openFile).not.toHaveBeenCalled()
  })

  it('marks the active file as selected', () => {
    useAppStore.setState({ activeFileId: 'src/App.tsx' })
    render(<FileTreeNode entry={fileEntry()} depth={0} tree={tree()} />)

    expect(screen.getByRole('treeitem')).toHaveAttribute('aria-selected', 'true')
  })

  it('renders expanded children of an expanded directory', () => {
    render(
      <FileTreeNode
        entry={{ name: 'src', path: 'src', isDirectory: true }}
        depth={0}
        tree={tree({
          expandedPaths: new Set(['src']),
          childrenByPath: { src: [fileEntry({ name: 'index.ts', path: 'src/index.ts' })] },
        })}
      />,
    )

    expect(screen.getByText('index.ts')).toBeInTheDocument()
  })

  it('renames the file via the context menu, committing on Enter', async () => {
    const renameOpenFile = vi.fn()
    const refreshParentOf = vi.fn()
    useAppStore.setState({ renameOpenFile })
    render(<FileTreeNode entry={fileEntry()} depth={0} tree={tree({ refreshParentOf })} />)

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('App.tsx') })
    await userEvent.click(await screen.findByText('Rename'))

    const input = screen.getByDisplayValue('App.tsx')
    await userEvent.clear(input)
    await userEvent.type(input, 'Renamed.tsx{Enter}')

    const rasik = (window as unknown as { rasik: { files: { move: ReturnType<typeof vi.fn> } } }).rasik
    await waitFor(() => expect(rasik.files.move).toHaveBeenCalledWith('src/App.tsx', 'src/Renamed.tsx'))
    expect(renameOpenFile).toHaveBeenCalledWith('src/App.tsx', 'src/Renamed.tsx')
    expect(refreshParentOf).toHaveBeenCalledWith('src/App.tsx')
  })

  it('cancels a rename on Escape without calling files.move', async () => {
    render(<FileTreeNode entry={fileEntry()} depth={0} tree={tree()} />)

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('App.tsx') })
    await userEvent.click(await screen.findByText('Rename'))
    const input = screen.getByDisplayValue('App.tsx')
    await userEvent.type(input, '{Escape}')

    expect(screen.queryByDisplayValue('App.tsx')).not.toBeInTheDocument()
    const rasik = (window as unknown as { rasik: { files: { move: ReturnType<typeof vi.fn> } } }).rasik
    expect(rasik.files.move).not.toHaveBeenCalled()
  })

  it('does not rename when the value is unchanged', async () => {
    render(<FileTreeNode entry={fileEntry()} depth={0} tree={tree()} />)

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('App.tsx') })
    await userEvent.click(await screen.findByText('Rename'))
    await userEvent.type(screen.getByDisplayValue('App.tsx'), '{Enter}')

    const rasik = (window as unknown as { rasik: { files: { move: ReturnType<typeof vi.fn> } } }).rasik
    expect(rasik.files.move).not.toHaveBeenCalled()
  })

  it('deletes the file after confirming the dialog', async () => {
    const closeFileByPath = vi.fn()
    const refreshParentOf = vi.fn()
    useAppStore.setState({ closeFileByPath })
    render(<FileTreeNode entry={fileEntry()} depth={0} tree={tree({ refreshParentOf })} />)

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('App.tsx') })
    await userEvent.click(await screen.findByText('Delete'))
    expect(screen.getByText('Delete App.tsx?')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    const rasik = (window as unknown as { rasik: { files: { delete: ReturnType<typeof vi.fn> } } }).rasik
    await waitFor(() => expect(rasik.files.delete).toHaveBeenCalledWith('src/App.tsx'))
    expect(closeFileByPath).toHaveBeenCalledWith('src/App.tsx')
    expect(refreshParentOf).toHaveBeenCalledWith('src/App.tsx')
  })

  it('cancelling the delete dialog does not call files.delete', async () => {
    render(<FileTreeNode entry={fileEntry()} depth={0} tree={tree()} />)

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('App.tsx') })
    await userEvent.click(await screen.findByText('Delete'))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('Delete App.tsx?')).not.toBeInTheDocument()
    const rasik = (window as unknown as { rasik: { files: { delete: ReturnType<typeof vi.fn> } } }).rasik
    expect(rasik.files.delete).not.toHaveBeenCalled()
  })

  it('copies the absolute path to the clipboard', async () => {
    render(<FileTreeNode entry={fileEntry()} depth={0} tree={tree()} />)

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('App.tsx') })
    await userEvent.click(await screen.findByText('Copy Path'))

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/ws/src/App.tsx')
  })

  it('reveals the file in the OS file manager', async () => {
    render(<FileTreeNode entry={fileEntry()} depth={0} tree={tree()} />)

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('App.tsx') })
    await userEvent.click(await screen.findByText('Reveal in OS'))

    const rasik = (window as unknown as { rasik: { shell: { showItemInFolder: ReturnType<typeof vi.fn> } } }).rasik
    expect(rasik.shell.showItemInFolder).toHaveBeenCalledWith('src/App.tsx')
  })

  it('opens a terminal at the entry’s directory and expands the bottom panel if collapsed', async () => {
    const createTerminal = vi.fn()
    const toggleBottomPanel = vi.fn()
    useAppStore.setState({ createTerminal, toggleBottomPanel, bottomPanelCollapsed: true })
    render(<FileTreeNode entry={fileEntry()} depth={0} tree={tree()} />)

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('App.tsx') })
    await userEvent.click(await screen.findByText('Open Terminal Here'))

    expect(toggleBottomPanel).toHaveBeenCalledOnce()
    expect(createTerminal).toHaveBeenCalledWith('src')
  })
})
