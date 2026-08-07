import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '../../store'
import { EditorTabBar } from './EditorTabBar'

function openFile(overrides: Partial<ReturnType<typeof useAppStore.getState>['openFiles'][number]> = {}) {
  return {
    id: 'f1',
    path: 'src/App.tsx',
    name: 'App.tsx',
    content: '',
    originalContent: '',
    isDirty: false,
    language: 'typescript',
    ...overrides,
  }
}

describe('EditorTabBar', () => {
  beforeEach(() => {
    useAppStore.setState({ openFiles: [], activeFileId: null })
  })

  it('renders nothing when no files are open', () => {
    const { container } = render(<EditorTabBar />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a tab per open file', () => {
    useAppStore.setState({
      openFiles: [openFile(), openFile({ id: 'f2', name: 'index.ts', path: 'src/index.ts' })],
      activeFileId: 'f1',
    })
    render(<EditorTabBar />)

    expect(screen.getByText('App.tsx')).toBeInTheDocument()
    expect(screen.getByText('index.ts')).toBeInTheDocument()
  })

  it('switches the active file when a tab is clicked', async () => {
    const setActiveFile = vi.fn()
    useAppStore.setState({
      openFiles: [openFile(), openFile({ id: 'f2', name: 'index.ts', path: 'src/index.ts' })],
      activeFileId: 'f1',
      setActiveFile,
    })
    render(<EditorTabBar />)

    await userEvent.click(screen.getByText('index.ts'))

    expect(setActiveFile).toHaveBeenCalledWith('f2')
  })

  it('closes a file when its close button is clicked', async () => {
    const closeFile = vi.fn()
    useAppStore.setState({ openFiles: [openFile()], activeFileId: 'f1', closeFile })
    render(<EditorTabBar />)

    await userEvent.click(screen.getByRole('button', { name: 'Close App.tsx' }))

    expect(closeFile).toHaveBeenCalledWith('f1')
  })

  it('shows a dirty indicator for an unsaved file', () => {
    useAppStore.setState({ openFiles: [openFile({ isDirty: true })], activeFileId: 'f1' })
    const { container } = render(<EditorTabBar />)

    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
