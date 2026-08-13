import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileExplorer } from './FileExplorer'
import { useAppStore } from '../../store'

function stubWorkspaceApi(): void {
  ;(window as unknown as { rasik: object }).rasik = {
    workspace: {
      openFolder: vi.fn(async () => ({ ok: true, data: null })),
      openPath: vi.fn(async () => ({ ok: true, data: '/dropped/project' })),
      getRoot: vi.fn(async () => ({ ok: true, data: null })),
      getPathForFile: vi.fn(() => '/dropped/project'),
    },
    files: {
      listAll: vi.fn(async () => ({ ok: true, data: [] })),
      list: vi.fn(async () => ({ ok: true, data: [] })),
    },
  }
}

describe('FileExplorer', () => {
  beforeEach(() => {
    stubWorkspaceApi()
    useAppStore.setState({ workspaceRoot: null, workspaceName: null, allFiles: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the empty state with an Open Folder button when no workspace is open', () => {
    render(<FileExplorer />)

    expect(screen.getByText('No folder opened')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open Folder/ })).toBeInTheDocument()
  })

  it('clicking Open Folder calls the native picker', async () => {
    render(<FileExplorer />)

    await userEvent.click(screen.getByRole('button', { name: /Open Folder/ }))

    const rasik = (window as unknown as { rasik: { workspace: { openFolder: ReturnType<typeof vi.fn> } } }).rasik
    expect(rasik.workspace.openFolder).toHaveBeenCalledOnce()
  })

  it('shows a drop hint while a drag is over the empty state', () => {
    render(<FileExplorer />)

    const dropZone = screen.getByText('No folder opened').parentElement!
    fireEvent.dragOver(dropZone)

    expect(screen.getByText('Drop to open this folder')).toBeInTheDocument()
  })

  it('dropping a folder resolves its path and opens it as the workspace', async () => {
    render(<FileExplorer />)
    const rasik = (
      window as unknown as {
        rasik: { workspace: { openPath: ReturnType<typeof vi.fn>; getPathForFile: ReturnType<typeof vi.fn> } }
      }
    ).rasik

    const dropZone = screen.getByText('No folder opened').parentElement!
    const file = new File(['x'], 'project')
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } })

    expect(rasik.workspace.getPathForFile).toHaveBeenCalledWith(file)
    await waitFor(() => expect(rasik.workspace.openPath).toHaveBeenCalledWith('/dropped/project'))
  })

  describe('when a workspace is open and synced to the backend', () => {
    beforeEach(() => {
      useAppStore.setState({
        workspaceRoot: '/ws',
        workspaceName: 'ws',
        allFiles: [],
        backendWorkspaceId: 'ws-1',
        indexingStatus: 'idle',
        indexingProgress: null,
        indexingError: null,
      })
    })

    it('shows an Index button and starting it calls startIndexing', async () => {
      const startIndexing = vi.fn(async () => undefined)
      useAppStore.setState({ startIndexing })

      render(<FileExplorer />)
      await userEvent.click(screen.getByRole('button', { name: /Index/ }))

      expect(startIndexing).toHaveBeenCalledOnce()
    })

    it('shows file-count progress while indexing', () => {
      useAppStore.setState({ indexingStatus: 'indexing', indexingProgress: { filesDone: 3, filesTotal: 10 } })

      render(<FileExplorer />)

      expect(screen.getByText('Indexing 3/10 files…')).toBeInTheDocument()
    })

    it('shows a completion message once indexing finishes', () => {
      useAppStore.setState({ indexingStatus: 'done', indexingProgress: { filesDone: 10, filesTotal: 10 } })

      render(<FileExplorer />)

      expect(screen.getByText('Indexed 10 files.')).toBeInTheDocument()
    })

    it('shows the error message when indexing fails', () => {
      useAppStore.setState({ indexingStatus: 'error', indexingError: 'Workspace not found' })

      render(<FileExplorer />)

      expect(screen.getByText('Workspace not found')).toBeInTheDocument()
    })

    it('does not show the Index button when not synced to a backend workspace', () => {
      useAppStore.setState({ backendWorkspaceId: null })

      render(<FileExplorer />)

      expect(screen.queryByRole('button', { name: /Index/ })).not.toBeInTheDocument()
    })
  })
})
