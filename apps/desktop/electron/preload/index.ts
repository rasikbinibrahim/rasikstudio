import { contextBridge, ipcRenderer } from 'electron'

const rasikApi = {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
}

export type RasikApi = typeof rasikApi

contextBridge.exposeInMainWorld('rasik', rasikApi)
