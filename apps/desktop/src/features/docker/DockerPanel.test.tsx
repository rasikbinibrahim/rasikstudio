import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '../../store'
import { DockerPanel } from './DockerPanel'
import type { DockerContainer } from '../../types/docker'

function fakeContainer(overrides: Partial<DockerContainer> = {}): DockerContainer {
  return {
    id: 'abc123',
    name: 'rasik-studio-redis-1',
    image: 'redis:7-alpine',
    state: 'running',
    status: 'Up 3 hours (healthy)',
    ports: '0.0.0.0:6379->6379/tcp',
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
      startLogs: vi.fn(),
      stopLogs: vi.fn(),
      onLogData: vi.fn(() => () => undefined),
      onLogClosed: vi.fn(() => () => undefined),
      exec: vi.fn(async () => ({ ok: true, data: 'pty-session-id' })),
      ...overrides,
    },
  }
}

describe('DockerPanel', () => {
  beforeEach(() => {
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

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists containers once loaded', async () => {
    render(<DockerPanel />)

    await waitFor(() => expect(screen.getByText('rasik-studio-redis-1')).toBeInTheDocument())
    expect(screen.getByText(/redis:7-alpine/)).toBeInTheDocument()
  })

  it('shows an empty state when Docker is unavailable', async () => {
    stubDockerApi({ list: vi.fn(async () => ({ ok: false, error: 'docker: command not found' })) })

    render(<DockerPanel />)

    await waitFor(() =>
      expect(screen.getByText('Docker CLI not found or the daemon is not running.')).toBeInTheDocument(),
    )
  })

  it('stopping a running container calls the IPC bridge and refreshes the list', async () => {
    const stop = vi.fn(async () => ({ ok: true, data: null }))
    const list = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: [fakeContainer()] })
      .mockResolvedValue({ ok: true, data: [fakeContainer({ state: 'exited', status: 'Exited (0) 1 second ago' })] })
    stubDockerApi({ stop, list })

    render(<DockerPanel />)
    await waitFor(() => expect(screen.getByText('rasik-studio-redis-1')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Stop' }))

    expect(stop).toHaveBeenCalledWith('abc123')
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  })

  it('selecting a container starts its log stream and shows the logs panel', async () => {
    render(<DockerPanel />)
    await waitFor(() => expect(screen.getByText('rasik-studio-redis-1')).toBeInTheDocument())

    await userEvent.click(screen.getByText('rasik-studio-redis-1'))

    expect(window.rasik.docker.startLogs).toHaveBeenCalledWith('abc123')
    expect(screen.getByText('Logs')).toBeInTheDocument()
  })

  it('opening a shell for a running container calls docker.exec and creates a terminal session', async () => {
    render(<DockerPanel />)
    await waitFor(() => expect(screen.getByText('rasik-studio-redis-1')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Open shell' }))

    expect(window.rasik.docker.exec).toHaveBeenCalledWith('abc123')
    await waitFor(() => expect(useAppStore.getState().terminals).toHaveLength(1))
    expect(useAppStore.getState().terminals[0]).toMatchObject({ title: 'rasik-studio-redis-1' })
  })
})
