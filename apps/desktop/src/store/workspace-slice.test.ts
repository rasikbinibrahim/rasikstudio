import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './index'
import * as workspaceSync from '../services/workspace-sync'
import * as indexingClient from '../services/indexing-client'

vi.mock('../services/workspace-sync')
vi.mock('../services/indexing-client')

function stubWorkspaceApi(): void {
  ;(window as unknown as { rasik: object }).rasik = {
    workspace: {
      openFolder: vi.fn(async () => ({ ok: true, data: '/real/project' })),
      openPath: vi.fn(async () => ({ ok: true, data: '/real/project' })),
    },
    files: {
      listAll: vi.fn(async () => ({ ok: true, data: [] })),
    },
  }
}

describe('workspace-slice', () => {
  beforeEach(() => {
    stubWorkspaceApi()
    useAppStore.setState({
      workspaceRoot: null,
      workspaceName: null,
      allFiles: [],
      backendWorkspaceId: null,
      indexingStatus: 'idle',
      indexingProgress: null,
      indexingError: null,
      accessToken: null,
      connectWorkspaceSocket: vi.fn(async () => undefined),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('openFolder does not sync or index when signed out', async () => {
    await useAppStore.getState().openFolder()

    expect(workspaceSync.syncWorkspaceWithBackend).not.toHaveBeenCalled()
    expect(indexingClient.indexWorkspace).not.toHaveBeenCalled()
    expect(useAppStore.getState().workspaceRoot).toBe('/real/project')
  })

  it('openFolder auto-triggers indexing once the backend sync succeeds while signed in', async () => {
    useAppStore.setState({ accessToken: 'token-123' })
    vi.mocked(workspaceSync.syncWorkspaceWithBackend).mockResolvedValue({
      id: 'ws-1',
      name: 'project',
      root_path: '/real/project',
    })
    vi.mocked(indexingClient.indexWorkspace).mockResolvedValue(undefined)

    await useAppStore.getState().openFolder()

    expect(workspaceSync.syncWorkspaceWithBackend).toHaveBeenCalledWith(
      'token-123',
      'project',
      '/real/project',
    )
    expect(useAppStore.getState().backendWorkspaceId).toBe('ws-1')
    await vi.waitFor(() => {
      expect(indexingClient.indexWorkspace).toHaveBeenCalledWith('token-123', 'ws-1')
    })
    await vi.waitFor(() => {
      expect(useAppStore.getState().indexingStatus).not.toBe('idle')
    })
  })

  it('openFolder does not auto-trigger indexing when the backend sync fails', async () => {
    useAppStore.setState({ accessToken: 'token-123' })
    vi.mocked(workspaceSync.syncWorkspaceWithBackend).mockResolvedValue(null)

    await useAppStore.getState().openFolder()

    expect(useAppStore.getState().backendWorkspaceId).toBeNull()
    expect(indexingClient.indexWorkspace).not.toHaveBeenCalled()
    expect(useAppStore.getState().indexingStatus).toBe('idle')
  })

  it('a failed auto-triggered index run surfaces as indexingStatus "error", not a thrown rejection', async () => {
    useAppStore.setState({ accessToken: 'token-123' })
    vi.mocked(workspaceSync.syncWorkspaceWithBackend).mockResolvedValue({
      id: 'ws-1',
      name: 'project',
      root_path: '/real/project',
    })
    vi.mocked(indexingClient.indexWorkspace).mockRejectedValue(new Error('boom'))

    await useAppStore.getState().openFolder()

    await vi.waitFor(() => {
      expect(useAppStore.getState().indexingStatus).toBe('error')
    })
    expect(useAppStore.getState().indexingError).toBe('boom')
  })
})
