import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '../../store'
import { CommitLog } from './CommitLog'

function stubGitApi(overrides: Record<string, unknown> = {}): void {
  ;(window as unknown as { rasik: { git: object } }).rasik = {
    ...(window as unknown as { rasik?: object }).rasik,
    git: {
      log: vi.fn(async () => ({ ok: true, data: [] })),
      ...overrides,
    },
  }
}

describe('CommitLog', () => {
  beforeEach(() => {
    stubGitApi()
    useAppStore.setState({ gitLog: [], gitLogLoading: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches the log on mount and renders each entry', async () => {
    const log = vi.fn(async () => ({
      ok: true,
      data: [
        { hash: 'abcdef1234567', message: 'fix: correct off-by-one' },
        { hash: '1234567abcdef', message: 'feat: add thing' },
      ],
    }))
    stubGitApi({ log })

    render(<CommitLog onClose={vi.fn()} />)

    expect(log).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.getByText('fix: correct off-by-one')).toBeInTheDocument())
    expect(screen.getByText('feat: add thing')).toBeInTheDocument()
    // Displayed hash is truncated to 7 characters, matching `git log --oneline`'s convention.
    expect(screen.getByText('abcdef1')).toBeInTheDocument()
  })

  it('shows an empty state when there are no commits', async () => {
    render(<CommitLog onClose={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('No commits yet.')).toBeInTheDocument())
  })

  it('the Back button calls onClose', async () => {
    const onClose = vi.fn()
    render(<CommitLog onClose={onClose} />)
    await waitFor(() => expect(screen.getByText('No commits yet.')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /Back/ }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})
