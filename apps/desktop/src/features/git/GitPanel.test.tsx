import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '../../store'
import type { GitStatusResult } from '../../types/git'

// `monaco-editor`'s dynamic `import('monaco-editor')` inside `useMonaco.ts` can't be resolved by
// Vite's import-analysis plugin in this test environment (a packaging/dependency-resolution
// quirk of monaco-editor@0.52, unrelated to this feature) — the same reason `MonacoEditor.tsx`
// itself has no dedicated test yet (`TASKS.md`'s known coverage gap). `DiffViewer.tsx` (imported
// transitively via `GitPanel.tsx`) is the first thing in the git feature to pull in `useMonaco`,
// so it needs the same mock any future `MonacoEditor.tsx` test would also need.
vi.mock('../editor/useMonaco', () => ({
  useMonaco: () => null,
  MONACO_DARK_THEME: 'rasik-dark',
  MONACO_LIGHT_THEME: 'rasik-light',
}))

const { GitPanel } = await import('./GitPanel')

function status(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
  return {
    branch: 'main',
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
    ...overrides,
  }
}

function stubGitApi(overrides: Record<string, unknown> = {}): void {
  ;(window as unknown as { rasik: { git: object; files: object } }).rasik = {
    ...(window as unknown as { rasik?: object }).rasik,
    git: {
      status: vi.fn(async () => ({ ok: true, data: status() })),
      stage: vi.fn(async () => ({ ok: true, data: null })),
      unstage: vi.fn(async () => ({ ok: true, data: null })),
      commit: vi.fn(async () => ({ ok: true, data: null })),
      diff: vi.fn(async () => ({ ok: true, data: '' })),
      showFile: vi.fn(async () => ({ ok: true, data: '' })),
      log: vi.fn(async () => ({ ok: true, data: [] })),
      branches: vi.fn(async () => ({ ok: true, data: [] })),
      checkout: vi.fn(async () => ({ ok: true, data: null })),
      push: vi.fn(async () => ({ ok: true, data: '' })),
      pull: vi.fn(async () => ({ ok: true, data: '' })),
      ...overrides,
    },
    files: {
      read: vi.fn(async () => ({ ok: true, data: '' })),
      write: vi.fn(async () => ({ ok: true, data: null })),
    },
  }
}

describe('GitPanel', () => {
  beforeEach(() => {
    stubGitApi()
    useAppStore.setState({
      workspaceRoot: null,
      gitStatus: null,
      gitStatusLoading: false,
      gitStatusError: null,
      gitBranches: [],
      gitDiffTarget: null,
      gitCommitMessage: '',
      gitCommitting: false,
      gitGeneratingCommitMessage: false,
      gitLog: [],
      gitLogLoading: false,
      gitPushing: false,
      gitPulling: false,
      gitPushPullMessage: null,
      gitPushPullError: null,
      accessToken: null,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows an empty state when no workspace is open', () => {
    render(<GitPanel />)

    expect(screen.getByText(/Open a folder first/)).toBeInTheDocument()
  })

  it('shows "Not a git repository" when the status call fails, with a Retry action', async () => {
    stubGitApi({ status: vi.fn(async () => ({ ok: false, error: 'not a git repository' })) })
    useAppStore.setState({ workspaceRoot: '/ws' })

    render(<GitPanel />)

    await waitFor(() => expect(screen.getByText('Not a git repository.')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('renders staged, unstaged, and untracked sections once status loads', async () => {
    stubGitApi({
      status: vi.fn(async () => ({
        ok: true,
        data: status({
          staged: [{ path: 'a.ts', status: 'added' }],
          unstaged: [{ path: 'b.ts', status: 'modified' }],
          untracked: [{ path: 'c.ts', status: 'untracked' }],
        }),
      })),
    })
    useAppStore.setState({ workspaceRoot: '/ws' })

    render(<GitPanel />)

    await waitFor(() => expect(screen.getByText('a.ts')).toBeInTheDocument())
    expect(screen.getByText('b.ts')).toBeInTheDocument()
    expect(screen.getByText('c.ts')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
  })

  it('staging an unstaged file calls the IPC bridge and refreshes status', async () => {
    const stage = vi.fn(async () => ({ ok: true, data: null }))
    const statusMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: status({ unstaged: [{ path: 'b.ts', status: 'modified' }] }) })
      .mockResolvedValue({ ok: true, data: status({ staged: [{ path: 'b.ts', status: 'modified' }] }) })
    stubGitApi({ stage, status: statusMock })
    useAppStore.setState({ workspaceRoot: '/ws' })

    render(<GitPanel />)
    await waitFor(() => expect(screen.getByText('b.ts')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: '+' }))

    expect(stage).toHaveBeenCalledWith(['b.ts'])
    await waitFor(() => expect(statusMock).toHaveBeenCalledTimes(2))
  })

  it('routes a conflicted file straight to the ConflictResolver instead of the status list', async () => {
    stubGitApi({
      status: vi.fn(async () => ({
        ok: true,
        data: status({ conflicted: [{ path: 'c.ts', status: 'conflicted' }] }),
      })),
    })
    useAppStore.setState({ workspaceRoot: '/ws' })

    render(<GitPanel />)

    await waitFor(() => expect(screen.getByText(/conflict.*remaining/)).toBeInTheDocument())
  })

  it('clicking Push calls the IPC bridge and shows the real git output', async () => {
    const push = vi.fn(async () => ({ ok: true, data: 'Everything up-to-date' }))
    stubGitApi({ push })
    useAppStore.setState({ workspaceRoot: '/ws' })

    render(<GitPanel />)
    await waitFor(() => expect(screen.getByText('main')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /^Push/ }))

    expect(push).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.getByText('Everything up-to-date')).toBeInTheDocument())
  })

  it('clicking Pull surfaces an error without crashing the panel', async () => {
    stubGitApi({ pull: vi.fn(async () => ({ ok: false, error: 'conflict' })) })
    useAppStore.setState({ workspaceRoot: '/ws' })

    render(<GitPanel />)
    await waitFor(() => expect(screen.getByText('main')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /^Pull/ }))

    await waitFor(() => expect(screen.getByText('conflict')).toBeInTheDocument())
  })

  it('clicking History swaps in the CommitLog view', async () => {
    stubGitApi({ log: vi.fn(async () => ({ ok: true, data: [{ hash: 'abc1234', message: 'fix: x' }] })) })
    useAppStore.setState({ workspaceRoot: '/ws' })

    render(<GitPanel />)
    await waitFor(() => expect(screen.getByText('main')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /^History/ }))

    await waitFor(() => expect(screen.getByText('fix: x')).toBeInTheDocument())
  })

  it('the Commit button is disabled until something is staged and a message is entered', async () => {
    stubGitApi({
      status: vi.fn(async () => ({
        ok: true,
        data: status({ staged: [{ path: 'a.ts', status: 'added' }] }),
      })),
    })
    useAppStore.setState({ workspaceRoot: '/ws' })

    render(<GitPanel />)
    await waitFor(() => expect(screen.getByText('a.ts')).toBeInTheDocument())

    const commitButton = screen.getByRole('button', { name: /^Commit/ })
    expect(commitButton).toBeDisabled()

    await userEvent.type(screen.getByPlaceholderText('Commit message'), 'fix: a bug')

    expect(commitButton).not.toBeDisabled()
  })
})
