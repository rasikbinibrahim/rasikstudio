import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './index'
import type { DockerContainer } from '../types/docker'

function fakeContainer(overrides: Partial<DockerContainer> = {}): DockerContainer {
  return {
    id: 'abc123',
    name: 'rasik-test',
    image: 'redis:7-alpine',
    state: 'running',
    status: 'Up 3 hours',
    ports: '6379/tcp',
    createdAt: '2026-08-05 10:00:00 +0000 UTC',
    ...overrides,
  }
}

function stubDockerApi(overrides: Record<string, unknown> = {}): void {
  ;(window as unknown as { rasik: { docker: object } }).rasik = {
    ...(window as unknown as { rasik?: object }).rasik,
    docker: {
      list: vi.fn(async () => ({ ok: true, data: [fakeContainer()] })),
      start: vi.fn(async () => ({ ok: true, data: null })),
      stop: vi.fn(async () => ({ ok: true, data: null })),
      restart: vi.fn(async () => ({ ok: true, data: null })),
      remove: vi.fn(async () => ({ ok: true, data: null })),
      startLogs: vi.fn(),
      stopLogs: vi.fn(),
      onLogData: vi.fn(() => () => undefined),
      onLogClosed: vi.fn(() => () => undefined),
      exec: vi.fn(async () => ({ ok: true, data: 'pty-session-id' })),
      ...overrides,
    },
  }
}

describe('docker-slice', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    stubDockerApi()
    useAppStore.setState({
      dockerContainers: [],
      dockerContainersLoading: false,
      dockerContainersError: null,
      dockerSelectedContainerId: null,
      dockerLogs: '',
      dockerLogsStreaming: false,
      terminals: [],
      activeTerminalId: null,
      bottomPanelCollapsed: true,
    })
  })

  it('refreshContainers populates dockerContainers on success', async () => {
    await useAppStore.getState().refreshContainers()

    expect(useAppStore.getState().dockerContainers).toEqual([fakeContainer()])
    expect(useAppStore.getState().dockerContainersLoading).toBe(false)
    expect(useAppStore.getState().dockerContainersError).toBeNull()
  })

  it('refreshContainers clears containers and records the error when Docker is unavailable', async () => {
    stubDockerApi({ list: vi.fn(async () => ({ ok: false, error: 'docker: command not found' })) })

    await useAppStore.getState().refreshContainers()

    expect(useAppStore.getState().dockerContainers).toEqual([])
    expect(useAppStore.getState().dockerContainersError).toBe('docker: command not found')
  })

  it('selectContainer sets the selection, clears prior logs, and starts a new log stream', () => {
    useAppStore.getState().selectContainer('abc123')

    expect(useAppStore.getState().dockerSelectedContainerId).toBe('abc123')
    expect(useAppStore.getState().dockerLogs).toBe('')
    expect(useAppStore.getState().dockerLogsStreaming).toBe(true)
    expect(window.rasik.docker.startLogs).toHaveBeenCalledWith('abc123')
  })

  it('selectContainer(null) stops the previously streaming container and clears streaming state', () => {
    useAppStore.getState().selectContainer('abc123')
    useAppStore.getState().selectContainer(null)

    expect(window.rasik.docker.stopLogs).toHaveBeenCalledWith('abc123')
    expect(useAppStore.getState().dockerSelectedContainerId).toBeNull()
    expect(useAppStore.getState().dockerLogsStreaming).toBe(false)
  })

  it('selecting a different container stops the previous stream before starting the new one', () => {
    useAppStore.getState().selectContainer('abc123')
    useAppStore.getState().selectContainer('def456')

    expect(window.rasik.docker.stopLogs).toHaveBeenCalledWith('abc123')
    expect(window.rasik.docker.startLogs).toHaveBeenCalledWith('def456')
  })

  it('startContainer calls the IPC bridge and refreshes the container list on success', async () => {
    const start = vi.fn(async () => ({ ok: true, data: null }))
    stubDockerApi({ start })

    await useAppStore.getState().startContainer('abc123')

    expect(start).toHaveBeenCalledWith('abc123')
    expect(window.rasik.docker.list).toHaveBeenCalledOnce()
  })

  it('stopContainer does not refresh when the IPC call fails', async () => {
    stubDockerApi({ stop: vi.fn(async () => ({ ok: false, error: 'boom' })) })

    await useAppStore.getState().stopContainer('abc123')

    expect(window.rasik.docker.list).not.toHaveBeenCalled()
  })

  it('restartContainer calls the IPC bridge and refreshes on success', async () => {
    const restart = vi.fn(async () => ({ ok: true, data: null }))
    stubDockerApi({ restart })

    await useAppStore.getState().restartContainer('abc123')

    expect(restart).toHaveBeenCalledWith('abc123')
    expect(window.rasik.docker.list).toHaveBeenCalledOnce()
  })

  it('removeContainer calls the IPC bridge and refreshes on success', async () => {
    const remove = vi.fn(async () => ({ ok: true, data: null }))
    stubDockerApi({ remove })

    await useAppStore.getState().removeContainer('abc123')

    expect(remove).toHaveBeenCalledWith('abc123')
    expect(window.rasik.docker.list).toHaveBeenCalledOnce()
  })

  it('removeContainer deselects the container first if it was the selected one', async () => {
    useAppStore.setState({ dockerSelectedContainerId: 'abc123' })

    await useAppStore.getState().removeContainer('abc123')

    expect(window.rasik.docker.stopLogs).toHaveBeenCalledWith('abc123')
    expect(useAppStore.getState().dockerSelectedContainerId).toBeNull()
  })

  it('removeContainer does not refresh or touch the selection when the IPC call fails', async () => {
    stubDockerApi({ remove: vi.fn(async () => ({ ok: false, error: 'boom' })) })
    useAppStore.setState({ dockerSelectedContainerId: 'abc123' })

    await useAppStore.getState().removeContainer('abc123')

    expect(window.rasik.docker.list).not.toHaveBeenCalled()
    expect(useAppStore.getState().dockerSelectedContainerId).toBe('abc123')
  })

  it('openContainerShell pushes a new terminal session and switches to it', async () => {
    await useAppStore.getState().openContainerShell('abc123', 'rasik-test')

    expect(window.rasik.docker.exec).toHaveBeenCalledWith('abc123')
    expect(useAppStore.getState().terminals).toEqual([
      { id: 'pty-session-id', title: 'rasik-test', cwd: '', status: 'active' },
    ])
    expect(useAppStore.getState().activeTerminalId).toBe('pty-session-id')
    expect(useAppStore.getState().bottomPanelCollapsed).toBe(false)
  })

  it('openContainerShell does nothing when the IPC call fails', async () => {
    stubDockerApi({ exec: vi.fn(async () => ({ ok: false, error: 'no such container' })) })

    await useAppStore.getState().openContainerShell('abc123', 'rasik-test')

    expect(useAppStore.getState().terminals).toEqual([])
  })

  it('handleLogData appends chunks; handleLogClosed marks streaming false', () => {
    useAppStore.getState().handleLogData('line 1\n')
    useAppStore.getState().handleLogData('line 2\n')

    expect(useAppStore.getState().dockerLogs).toBe('line 1\nline 2\n')

    useAppStore.getState().handleLogClosed()
    expect(useAppStore.getState().dockerLogsStreaming).toBe(false)
  })

  it('handleLogData truncates from the front once the buffer exceeds its cap', () => {
    useAppStore.setState({ dockerLogs: 'x'.repeat(200_000) })

    useAppStore.getState().handleLogData('y'.repeat(10))

    const logs = useAppStore.getState().dockerLogs
    expect(logs.length).toBe(200_000)
    expect(logs.endsWith('y'.repeat(10))).toBe(true)
  })
})
