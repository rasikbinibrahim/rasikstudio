import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcResult } from '../../../src/types/ipc'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const handleHandlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      handleHandlers.set(channel, handler)
    }),
  },
}))

const getWorkspaceRootMock = vi.fn<() => string | null>()
vi.mock('../workspace-state', () => ({
  getWorkspaceRoot: () => getWorkspaceRootMock(),
}))

const gitServiceMock = {
  status: vi.fn(),
  stage: vi.fn(),
  unstage: vi.fn(),
  commit: vi.fn(),
  diff: vi.fn(),
  showFile: vi.fn(),
  log: vi.fn(),
  branches: vi.fn(),
  checkout: vi.fn(),
  push: vi.fn(),
  pull: vi.fn(),
}
vi.mock('../git-service', () => ({
  GitService: vi.fn(() => gitServiceMock),
}))

describe('git IPC handlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    handleHandlers.clear()
    getWorkspaceRootMock.mockReturnValue('/workspace/root')

    const { registerGitHandlers } = await import('./git-handlers')
    registerGitHandlers()
  })

  it('git:status rejects when no workspace is open, without touching GitService', async () => {
    getWorkspaceRootMock.mockReturnValue(null)

    const result = (await handleHandlers.get('git:status')?.({})) as IpcResult<unknown>

    expect(result.ok).toBe(false)
    expect(gitServiceMock.status).not.toHaveBeenCalled()
  })

  it('git:status returns whatever GitService.status() resolves', async () => {
    gitServiceMock.status.mockResolvedValueOnce({ branch: 'main', staged: [] })

    const result = (await handleHandlers.get('git:status')?.({})) as IpcResult<unknown>

    expect(result).toEqual({ ok: true, data: { branch: 'main', staged: [] } })
  })

  it('git:stage rejects a path-traversal attempt without calling GitService', async () => {
    const result = (await handleHandlers.get('git:stage')?.({}, ['../../etc/passwd'])) as IpcResult<null>

    expect(result.ok).toBe(false)
    expect(gitServiceMock.stage).not.toHaveBeenCalled()
  })

  it('git:stage forwards valid relative paths to GitService.stage', async () => {
    const result = (await handleHandlers.get('git:stage')?.({}, ['src/a.ts'])) as IpcResult<null>

    expect(result).toEqual({ ok: true, data: null })
    expect(gitServiceMock.stage).toHaveBeenCalledWith(['src/a.ts'])
  })

  it('git:unstage forwards valid relative paths to GitService.unstage', async () => {
    await handleHandlers.get('git:unstage')?.({}, ['src/a.ts'])

    expect(gitServiceMock.unstage).toHaveBeenCalledWith(['src/a.ts'])
  })

  it('git:commit forwards the message to GitService.commit', async () => {
    const result = (await handleHandlers.get('git:commit')?.({}, 'fix: bug')) as IpcResult<null>

    expect(result).toEqual({ ok: true, data: null })
    expect(gitServiceMock.commit).toHaveBeenCalledWith('fix: bug')
  })

  it('git:commit surfaces a GitService failure (e.g. empty commit) as an error result', async () => {
    gitServiceMock.commit.mockRejectedValueOnce(new Error('nothing to commit'))

    const result = (await handleHandlers.get('git:commit')?.({}, 'x')) as IpcResult<null>

    expect(result).toEqual({ ok: false, error: 'nothing to commit' })
  })

  it('git:diff rejects a path-traversal filePath without calling GitService', async () => {
    const result = (await handleHandlers.get('git:diff')?.({}, true, '../outside.txt')) as IpcResult<string>

    expect(result.ok).toBe(false)
    expect(gitServiceMock.diff).not.toHaveBeenCalled()
  })

  it('git:diff forwards staged flag and filePath to GitService.diff', async () => {
    gitServiceMock.diff.mockResolvedValueOnce('+added line')

    const result = (await handleHandlers.get('git:diff')?.({}, true, 'a.txt')) as IpcResult<string>

    expect(result).toEqual({ ok: true, data: '+added line' })
    expect(gitServiceMock.diff).toHaveBeenCalledWith(true, 'a.txt')
  })

  it('git:showFile rejects a path-traversal filePath without calling GitService', async () => {
    const result = (await handleHandlers.get('git:showFile')?.({}, 'HEAD', '../outside.txt')) as IpcResult<string>

    expect(result.ok).toBe(false)
    expect(gitServiceMock.showFile).not.toHaveBeenCalled()
  })

  it('git:showFile forwards ref and filePath to GitService.showFile', async () => {
    gitServiceMock.showFile.mockResolvedValueOnce('old content\n')

    const result = (await handleHandlers.get('git:showFile')?.({}, 'HEAD', 'a.txt')) as IpcResult<string>

    expect(result).toEqual({ ok: true, data: 'old content\n' })
    expect(gitServiceMock.showFile).toHaveBeenCalledWith('HEAD', 'a.txt')
  })

  it('git:log forwards limit and branch to GitService.log', async () => {
    gitServiceMock.log.mockResolvedValueOnce([{ hash: 'abc', message: 'init' }])

    const result = (await handleHandlers.get('git:log')?.({}, 10, 'main')) as IpcResult<unknown>

    expect(result).toEqual({ ok: true, data: [{ hash: 'abc', message: 'init' }] })
    expect(gitServiceMock.log).toHaveBeenCalledWith(10, 'main')
  })

  it('git:branches returns GitService.branches() result', async () => {
    gitServiceMock.branches.mockResolvedValueOnce([{ name: 'main', current: true, remote: false }])

    const result = (await handleHandlers.get('git:branches')?.({})) as IpcResult<unknown>

    expect(result).toEqual({ ok: true, data: [{ name: 'main', current: true, remote: false }] })
  })

  it('git:checkout forwards the branch name to GitService.checkout', async () => {
    await handleHandlers.get('git:checkout')?.({}, 'feature')

    expect(gitServiceMock.checkout).toHaveBeenCalledWith('feature')
  })

  it('git:push returns GitService.push() output', async () => {
    gitServiceMock.push.mockResolvedValueOnce('Everything up-to-date')

    const result = (await handleHandlers.get('git:push')?.({})) as IpcResult<string>

    expect(result).toEqual({ ok: true, data: 'Everything up-to-date' })
  })

  it('git:pull returns GitService.pull() output', async () => {
    gitServiceMock.pull.mockResolvedValueOnce('Already up to date.')

    const result = (await handleHandlers.get('git:pull')?.({})) as IpcResult<string>

    expect(result).toEqual({ ok: true, data: 'Already up to date.' })
  })
})
