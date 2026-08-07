import type { StateCreator } from 'zustand'
import type { AppStore } from './types'
import { WsClient, type WsConnectionStatus } from '../services/ws-client'
import { getBackendWsBaseUrl } from '../lib/backend-config'

export interface WsSlice {
  wsStatus: WsConnectionStatus
  wsClient: WsClient
  connectWorkspaceSocket: (workspaceId: string) => Promise<void>
  disconnectWorkspaceSocket: () => void
}

export const createWsSlice: StateCreator<AppStore, [['zustand/immer', never]], [], WsSlice> = (
  set,
  get,
) => {
  const client = new WsClient({
    getBaseUrl: getBackendWsBaseUrl,
    getToken: () => Promise.resolve(get().accessToken),
    onStatusChange: (status) => {
      set((state) => {
        state.wsStatus = status
      })
    },
  })

  return {
    wsStatus: 'disconnected',
    wsClient: client,
    connectWorkspaceSocket: (workspaceId) => client.connect(workspaceId),
    disconnectWorkspaceSocket: () => client.disconnect(),
  }
}
