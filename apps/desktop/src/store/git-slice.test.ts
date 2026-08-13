import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './index'
import * as gitClient from '../services/git-client'
import type { GitStatusResult } from '../types/git'

vi.mock('../services/git-client')

function emptyStatus(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
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
      status: vi.fn(async () => ({ ok: true, data: emptyStatus() })),
      stage: vi.fn(async () => ({ ok: true, data: null })),
      unstage: vi.fn(async () => ({ ok: true, data: null })),
      commit: vi.fn(async () => ({ ok: true, data: null })),
      diff: vi.fn(async () => ({ ok: true, data: 'diff --git a/x b/x\n+1' })),
      showFile: vi.fn(async () => ({ ok: true, data: '' })),
      log: vi.fn(async () => ({ ok: true, data: [] })),
      branches: vi.fn(async () => ({ ok: true, data: [] })),
      checkout: vi.fn(async () => ({ ok: true, data: null })),
      push: vi.fn(async () => ({ ok: true, data: '' })),
      pull: vi.fn(async () => ({ ok: true, data: '' })),
      ...overrides,
    },
  }
}

describe('git-slice', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    stubGitApi()
    useAppStore.setState({
      accessToken: 'tok',
      gitStatus: null,
      gitStatusLoading: false,
      gitStatusError: null,
      gitBranches: [],
      gitDiffTarget: null,
      gitCommitMessage: '',
      gitCommitting: false,
      gitGeneratingCommitMessage: false,
    })
  })

  it('refreshGitStatus populates gitStatus on success', async () => {
    stubGitApi({ status: vi.fn(async () => ({ ok: true, data: emptyStatus({ branch: 'feature' }) })) })

    await useAppStore.getState().refreshGitStatus()

    expect(useAppStore.getState().gitStatus?.branch).toBe('feature')
    expect(useAppStore.getState().gitStatusLoading).toBe(false)
    expect(useAppStore.getState().gitStatusError).toBeNull()
  })

  it('refreshGitStatus clears gitStatus and records the error when not a git repo', async () => {
    stubGitApi({ status: vi.fn(async () => ({ ok: false, error: 'not a git repository' })) })

    await useAppStore.getState().refreshGitStatus()

    expect(useAppStore.getState().gitStatus).toBeNull()
    expect(useAppStore.getState().gitStatusError).toBe('not a git repository')
  })

  it('stageFiles calls the IPC bridge and refreshes status on success', async () => {
    const stage = vi.fn(async () => ({ ok: true, data: null }))
    stubGitApi({ stage })

    await useAppStore.getState().stageFiles(['a.txt'])

    expect(stage).toHaveBeenCalledWith(['a.txt'])
    expect(window.rasik.git.status).toHaveBeenCalledOnce()
  })

  it('stageFiles does not refresh status when the IPC call fails', async () => {
    stubGitApi({ stage: vi.fn(async () => ({ ok: false, error: 'boom' })) })

    await useAppStore.getState().stageFiles(['a.txt'])

    expect(window.rasik.git.status).not.toHaveBeenCalled()
  })

  it('unstageFiles calls the IPC bridge and refreshes status on success', async () => {
    const unstage = vi.fn(async () => ({ ok: true, data: null }))
    stubGitApi({ unstage })

    await useAppStore.getState().unstageFiles(['a.txt'])

    expect(unstage).toHaveBeenCalledWith(['a.txt'])
    expect(window.rasik.git.status).toHaveBeenCalledOnce()
  })

  it('openDiff sets the diff target; closeDiff clears it', () => {
    useAppStore.getState().openDiff('a.txt', true)
    expect(useAppStore.getState().gitDiffTarget).toEqual({ path: 'a.txt', staged: true })

    useAppStore.getState().closeDiff()
    expect(useAppStore.getState().gitDiffTarget).toBeNull()
  })

  it('setCommitMessage updates gitCommitMessage', () => {
    useAppStore.getState().setCommitMessage('fix: thing')

    expect(useAppStore.getState().gitCommitMessage).toBe('fix: thing')
  })

  it('commit does nothing for a blank message', async () => {
    useAppStore.setState({ gitCommitMessage: '   ' })

    await useAppStore.getState().commit()

    expect(window.rasik.git.commit).not.toHaveBeenCalled()
  })

  it('commit calls the IPC bridge, clears the message, and refreshes status on success', async () => {
    useAppStore.setState({ gitCommitMessage: 'fix: thing' })

    await useAppStore.getState().commit()

    expect(window.rasik.git.commit).toHaveBeenCalledWith('fix: thing')
    expect(useAppStore.getState().gitCommitMessage).toBe('')
    expect(window.rasik.git.status).toHaveBeenCalledOnce()
  })

  it('commit leaves the message untouched when the IPC call fails', async () => {
    stubGitApi({ commit: vi.fn(async () => ({ ok: false, error: 'nothing to commit' })) })
    useAppStore.setState({ gitCommitMessage: 'fix: thing' })

    await useAppStore.getState().commit()

    expect(useAppStore.getState().gitCommitMessage).toBe('fix: thing')
  })

  it('generateCommitMessage fetches the staged diff and asks git-client for a message', async () => {
    vi.mocked(gitClient.generateCommitMessage).mockResolvedValue('fix: generated message')

    await useAppStore.getState().generateCommitMessage()

    expect(gitClient.generateCommitMessage).toHaveBeenCalledWith(
      'tok',
      'diff --git a/x b/x\n+1',
      expect.any(String),
    )
    expect(useAppStore.getState().gitCommitMessage).toBe('fix: generated message')
    expect(useAppStore.getState().gitGeneratingCommitMessage).toBe(false)
  })

  it('generateCommitMessage does nothing when there is no staged diff', async () => {
    stubGitApi({ diff: vi.fn(async () => ({ ok: true, data: '' })) })

    await useAppStore.getState().generateCommitMessage()

    expect(gitClient.generateCommitMessage).not.toHaveBeenCalled()
  })

  it('generateCommitMessage does nothing when signed out', async () => {
    useAppStore.setState({ accessToken: null })

    await useAppStore.getState().generateCommitMessage()

    expect(window.rasik.git.diff).not.toHaveBeenCalled()
  })

  it('checkoutBranch calls the IPC bridge and refreshes status + branches on success', async () => {
    const checkout = vi.fn(async () => ({ ok: true, data: null }))
    stubGitApi({ checkout })

    await useAppStore.getState().checkoutBranch('feature')

    expect(checkout).toHaveBeenCalledWith('feature')
    expect(window.rasik.git.status).toHaveBeenCalledOnce()
    expect(window.rasik.git.branches).toHaveBeenCalledOnce()
  })

  it('refreshGitLog populates gitLog and clears the loading flag', async () => {
    stubGitApi({
      log: vi.fn(async () => ({ ok: true, data: [{ hash: 'abc123', message: 'fix: thing' }] })),
    })

    await useAppStore.getState().refreshGitLog()

    expect(useAppStore.getState().gitLog).toEqual([{ hash: 'abc123', message: 'fix: thing' }])
    expect(useAppStore.getState().gitLogLoading).toBe(false)
  })

  it('push calls the IPC bridge, records the real git output, and refreshes status on success', async () => {
    const push = vi.fn(async () => ({ ok: true, data: 'To origin\n   abc123..def456  main -> main' }))
    stubGitApi({ push })

    await useAppStore.getState().push()

    expect(push).toHaveBeenCalledOnce()
    expect(useAppStore.getState().gitPushPullMessage).toBe('To origin\n   abc123..def456  main -> main')
    expect(useAppStore.getState().gitPushPullError).toBeNull()
    expect(useAppStore.getState().gitPushing).toBe(false)
    expect(window.rasik.git.status).toHaveBeenCalledOnce()
  })

  it('push records the error and does not refresh status on failure', async () => {
    stubGitApi({ push: vi.fn(async () => ({ ok: false, error: 'rejected: non-fast-forward' })) })

    await useAppStore.getState().push()

    expect(useAppStore.getState().gitPushPullError).toBe('rejected: non-fast-forward')
    expect(useAppStore.getState().gitPushPullMessage).toBeNull()
    expect(window.rasik.git.status).not.toHaveBeenCalled()
  })

  it('pull calls the IPC bridge, records the real git output, and refreshes status on success', async () => {
    const pull = vi.fn(async () => ({ ok: true, data: 'Already up to date.' }))
    stubGitApi({ pull })

    await useAppStore.getState().pull()

    expect(pull).toHaveBeenCalledOnce()
    expect(useAppStore.getState().gitPushPullMessage).toBe('Already up to date.')
    expect(useAppStore.getState().gitPulling).toBe(false)
    expect(window.rasik.git.status).toHaveBeenCalledOnce()
  })

  it('pull records the error and does not refresh status on failure', async () => {
    stubGitApi({ pull: vi.fn(async () => ({ ok: false, error: 'conflict' })) })

    await useAppStore.getState().pull()

    expect(useAppStore.getState().gitPushPullError).toBe('conflict')
    expect(window.rasik.git.status).not.toHaveBeenCalled()
  })
})
