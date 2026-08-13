import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '../store'
import { StatusBar } from './StatusBar'

describe('StatusBar', () => {
  beforeEach(() => {
    useAppStore.setState({
      workspaceName: null,
      activeFileId: null,
      openFiles: [],
      cursorPosition: null,
      user: null,
      authRestoring: false,
      gitStatus: null,
    })
  })

  it('shows "No folder opened" when no workspace is open', () => {
    render(<StatusBar />)
    expect(screen.getByText('No folder opened')).toBeInTheDocument()
  })

  it('shows the workspace name when a folder is open', () => {
    useAppStore.setState({ workspaceName: 'my-project' })
    render(<StatusBar />)
    expect(screen.getByText('my-project')).toBeInTheDocument()
  })

  it('shows the git branch and switches to the Git view when clicked', async () => {
    useAppStore.setState({
      gitStatus: { branch: 'main', upstream: null, ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [], conflicted: [] },
    })
    render(<StatusBar />)

    await userEvent.click(screen.getByText('main'))

    expect(useAppStore.getState().activeSidebarView).toBe('git')
  })

  it('shows the active file path and cursor position', () => {
    useAppStore.setState({
      openFiles: [{ id: 'f1', path: 'src/App.tsx', name: 'App.tsx', content: '', isDirty: false }],
      activeFileId: 'f1',
      cursorPosition: { line: 3, column: 8 },
    })
    render(<StatusBar />)

    expect(screen.getByText('src/App.tsx')).toBeInTheDocument()
    expect(screen.getByText('Ln 3, Col 8')).toBeInTheDocument()
  })

  it('shows "Sign In" when signed out, and opens the auth dialog when clicked', async () => {
    render(<StatusBar />)

    await userEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(useAppStore.getState().authDialogOpen).toBe(true)
  })

  it('shows the signed-in email and signs out when clicked', async () => {
    const signOut = vi.fn()
    useAppStore.setState({
      user: { id: 'u1', email: 'dev@example.com', name: 'Dev' },
      signOut,
    })
    render(<StatusBar />)

    await userEvent.click(screen.getByRole('button', { name: 'Signed in as dev@example.com' }))

    expect(signOut).toHaveBeenCalledOnce()
  })

  it('disables the sign-in button while restoring a persisted session', () => {
    useAppStore.setState({ authRestoring: true })
    render(<StatusBar />)

    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled()
  })
})
