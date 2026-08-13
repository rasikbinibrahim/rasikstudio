import { ipcMain } from 'electron'
import { homedir } from 'node:os'
import { getWorkspaceRoot } from '../workspace-state'
import { DockerService, DockerCommandError } from '../docker-service'
import { dockerLogStreamManager } from '../docker-log-stream'
import { ptyManager } from '../pty-manager'
import type { DockerContainer } from '../../../src/types/docker'
import type { IpcResult } from '../../../src/types/ipc'

const dockerService = new DockerService()

function toError(err: unknown): string {
  if (err instanceof DockerCommandError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}

export function registerDockerHandlers(): void {
  ipcMain.handle('docker:list', async (): Promise<IpcResult<DockerContainer[]>> => {
    try {
      const data = await dockerService.listContainers()
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: toError(err) }
    }
  })

  ipcMain.handle('docker:start', async (_event, id: string): Promise<IpcResult<null>> => {
    try {
      await dockerService.start(id)
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: toError(err) }
    }
  })

  ipcMain.handle('docker:stop', async (_event, id: string): Promise<IpcResult<null>> => {
    try {
      await dockerService.stop(id)
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: toError(err) }
    }
  })

  ipcMain.handle('docker:restart', async (_event, id: string): Promise<IpcResult<null>> => {
    try {
      await dockerService.restart(id)
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: toError(err) }
    }
  })

  ipcMain.handle('docker:remove', async (_event, id: string): Promise<IpcResult<null>> => {
    try {
      await dockerService.remove(id)
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: toError(err) }
    }
  })

  ipcMain.on('docker:logs:start', (_event, id: string) => {
    dockerLogStreamManager.start(id)
  })

  ipcMain.on('docker:logs:stop', (_event, id: string) => {
    dockerLogStreamManager.stop(id)
  })

  // Reuses PtyManager/xterm — same pipeline "Open Terminal Here" already established — instead of
  // a second terminal implementation. The returned PTY session id is a normal terminal id from
  // the renderer's point of view (`terminal:data:{id}`/`terminal:exit:{id}` fire exactly as they
  // would for a shell), the desktop store just labels the tab with the container's name.
  ipcMain.handle('docker:exec', (_event, id: string): IpcResult<string> => {
    try {
      const cwd = getWorkspaceRoot() ?? homedir()
      const ptyId = ptyManager.create({ cwd, command: 'docker', args: ['exec', '-it', id, '/bin/sh'] })
      return { ok: true, data: ptyId }
    } catch (err) {
      const message = toError(err)
      console.error(`[docker:exec] failed: ${message}`)
      return { ok: false, error: message }
    }
  })
}
