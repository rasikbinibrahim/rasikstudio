import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '../../store'
import { BranchSwitcher } from './BranchSwitcher'
import type { GitBranch, GitStatusResult } from '../../types/git'

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
  ;(window as unknown as { rasik: { git: object } }).rasik = {
    ...(window as unknown as { rasik?: object }).rasik,
    git: {
      branches: vi.fn(async () => ({ ok: true, data: [] })),
      checkout: vi.fn(async () => ({ ok: true, data: null })),
      status: vi.fn(async () => ({ ok: true, data: null })),
      ...overrides,
    },
  }
}

function branch(overrides: Partial<GitBranch> = {}): GitBranch {
  return { name: 'main', current: true, remote: false, ...overrides }
}

describe('BranchSwitcher', () => {
  beforeEach(() => {
    stubGitApi()
    useAppStore.setState({ gitStatus: status(), gitBranches: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the current branch name as the trigger', () => {
    render(<BranchSwitcher />)

    expect(screen.getByRole('button', { name: /main/ })).toBeInTheDocument()
  })

  it('fetches branches and opens the picker dialog on click', async () => {
    const branches = vi.fn(async () => ({
      ok: true,
      data: [branch({ name: 'main', current: true }), branch({ name: 'feature/x', current: false })],
    }))
    stubGitApi({ branches })

    render(<BranchSwitcher />)
    await userEvent.click(screen.getByRole('button', { name: /main/ }))

    expect(branches).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.getByText('feature/x')).toBeInTheDocument())
  })

  it('groups local and remote branches separately', async () => {
    stubGitApi({
      branches: vi.fn(async () => ({
        ok: true,
        data: [
          branch({ name: 'main', current: true, remote: false }),
          branch({ name: 'remotes/origin/main', current: false, remote: true }),
        ],
      })),
    })

    render(<BranchSwitcher />)
    await userEvent.click(screen.getByRole('button', { name: /main/ }))

    await waitFor(() => expect(screen.getByText('Local')).toBeInTheDocument())
    expect(screen.getByText('Remote')).toBeInTheDocument()
  })

  it('checking out a branch calls the store action and closes the dialog', async () => {
    const checkout = vi.fn(async () => ({ ok: true, data: null }))
    stubGitApi({
      checkout,
      branches: vi.fn(async () => ({
        ok: true,
        data: [branch({ name: 'main', current: true }), branch({ name: 'feature/x', current: false })],
      })),
    })

    render(<BranchSwitcher />)
    await userEvent.click(screen.getByRole('button', { name: /main/ }))
    await waitFor(() => expect(screen.getByText('feature/x')).toBeInTheDocument())

    await userEvent.click(screen.getByText('feature/x'))

    expect(checkout).toHaveBeenCalledWith('feature/x')
    await waitFor(() => expect(screen.queryByText('Switch Branch')).not.toBeInTheDocument())
  })

  it('the current branch entry is disabled, not clickable', async () => {
    stubGitApi({
      branches: vi.fn(async () => ({ ok: true, data: [branch({ name: 'main', current: true })] })),
    })

    render(<BranchSwitcher />)
    await userEvent.click(screen.getByRole('button', { name: /main/ }))

    await waitFor(() => expect(screen.getByText('current')).toBeInTheDocument())
    const entries = screen.getAllByRole('button', { name: /main/ })
    const dialogEntry = entries.find((el) => el.textContent?.includes('current'))
    expect(dialogEntry).toBeDisabled()
  })
})
