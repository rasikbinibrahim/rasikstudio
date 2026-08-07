import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcResult } from '../../../src/types/ipc'
import type { DockerContainer } from '../../../src/types/docker'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const handleHandlers = new Map<string, Handler>()
const onHandlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Handler) => {
      handleHandlers.set(channel, handler)
    }),
    on: vi.fn((channel: string, handler: Handler) => {
      onHandlers.set(channel, handler)
    }),
  },
}))

const getWorkspaceRootMock = vi.fn<() => string | null>()
vi.mock('../workspace-state', () => ({
  getWorkspaceRoot: () => getWorkspaceRootMock(),
}))

const fakeContainer: DockerContainer = {
  id: 'abc123',
  name: 'rasik-test',
  image: 'redis:7-alpine',
  state: 'running',
  status: 'Up 3 hours',
  ports: '6379/tcp',
  createdAt: '2026-08-05 10:00:00 +0000 UTC',
}

const dockerServiceMock = {
  listContainers: vi.fn(async () => [fakeContainer]),
  start: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined),
  restart: vi.fn(async () => undefined),
}
class FakeDockerCommandError extends Error {}
vi.mock('../docker-service', () => ({
  DockerService: vi.fn(() => dockerServiceMock),
  DockerCommandError: FakeDockerCommandError,
}))

const dockerLogStreamManagerMock = {
  start: vi.fn(),
  stop: vi.fn(),
}
vi.mock('../docker-log-stream', () => ({
  dockerLogStreamManager: dockerLogStreamManagerMock,
}))

const ptyManagerMock = {
  create: vi.fn<(...args: unknown[]) => string>(() => 'pty-session-id'),
}
vi.mock('../pty-manager', () => ({
  ptyManager: ptyManagerMock,
}))

describe('docker IPC handlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    handleHandlers.clear()
    onHandlers.clear()
    getWorkspaceRootMock.mockReturnValue('/workspace/root')
    dockerServiceMock.listContainers.mockResolvedValue([fakeContainer])
    ptyManagerMock.create.mockReturnValue('pty-session-id')

    const { registerDockerHandlers } = await import('./docker-handlers')
    registerDockerHandlers()
  })

  it('docker:list returns the containers from DockerService', async () => {
    const handler = handleHandlers.get('docker:list')
    const result = (await handler?.({})) as IpcResult<DockerContainer[]>

    expect(result).toEqual({ ok: true, data: [fakeContainer] })
  })

  it('docker:list maps a DockerCommandError to an ok:false result instead of throwing', async () => {
    dockerServiceMock.listContainers.mockRejectedValueOnce(new FakeDockerCommandError('docker: command not found'))
    const handler = handleHandlers.get('docker:list')

    const result = (await handler?.({})) as IpcResult<DockerContainer[]>

    expect(result).toEqual({ ok: false, error: 'docker: command not found' })
  })

  it('docker:start forwards the container id to DockerService', async () => {
    const handler = handleHandlers.get('docker:start')
    const result = (await handler?.({}, 'abc123')) as IpcResult<null>

    expect(result).toEqual({ ok: true, data: null })
    expect(dockerServiceMock.start).toHaveBeenCalledWith('abc123')
  })

  it('docker:stop forwards the container id to DockerService', async () => {
    const handler = handleHandlers.get('docker:stop')
    await handler?.({}, 'abc123')

    expect(dockerServiceMock.stop).toHaveBeenCalledWith('abc123')
  })

  it('docker:restart forwards the container id to DockerService', async () => {
    const handler = handleHandlers.get('docker:restart')
    await handler?.({}, 'abc123')

    expect(dockerServiceMock.restart).toHaveBeenCalledWith('abc123')
  })

  it('docker:logs:start forwards the container id to the log stream manager', () => {
    const handler = onHandlers.get('docker:logs:start')
    handler?.({}, 'abc123')

    expect(dockerLogStreamManagerMock.start).toHaveBeenCalledWith('abc123')
  })

  it('docker:logs:stop forwards the container id to the log stream manager', () => {
    const handler = onHandlers.get('docker:logs:stop')
    handler?.({}, 'abc123')

    expect(dockerLogStreamManagerMock.stop).toHaveBeenCalledWith('abc123')
  })

  it('docker:exec spawns `docker exec -it {id} /bin/sh` at the workspace root via PtyManager', async () => {
    const handler = handleHandlers.get('docker:exec')
    const result = (await handler?.({}, 'abc123')) as IpcResult<string>

    expect(result).toEqual({ ok: true, data: 'pty-session-id' })
    expect(ptyManagerMock.create).toHaveBeenCalledWith({
      cwd: '/workspace/root',
      command: 'docker',
      args: ['exec', '-it', 'abc123', '/bin/sh'],
    })
  })

  it('docker:exec falls back to the home directory when no workspace is open', async () => {
    getWorkspaceRootMock.mockReturnValue(null)
    const handler = handleHandlers.get('docker:exec')

    const result = (await handler?.({}, 'abc123')) as IpcResult<string>

    expect(result.ok).toBe(true)
    const call = ptyManagerMock.create.mock.calls[0]?.[0] as { cwd: string }
    expect(call.cwd).not.toBe('')
  })
})
