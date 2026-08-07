import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  kill = vi.fn()
}

const spawnMock = vi.fn()
const sendMock = vi.fn()
const getAllWindowsMock = vi.fn(() => [{ webContents: { send: sendMock } }])

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => getAllWindowsMock(),
  },
}))

describe('DockerLogStreamManager', () => {
  beforeEach(() => {
    vi.resetModules()
    spawnMock.mockReset()
    sendMock.mockReset()
    getAllWindowsMock.mockReset()
    getAllWindowsMock.mockReturnValue([{ webContents: { send: sendMock } }])
  })

  async function loadManager(): Promise<typeof import('./docker-log-stream')> {
    return import('./docker-log-stream')
  }

  it('spawns `docker logs -f --tail 200 {id}` for a new stream', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)
    const { dockerLogStreamManager } = await loadManager()

    dockerLogStreamManager.start('abc123')

    expect(spawnMock).toHaveBeenCalledWith('docker', ['logs', '-f', '--tail', '200', 'abc123'])
  })

  it('does not spawn a second process for a container already being streamed', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)
    const { dockerLogStreamManager } = await loadManager()

    dockerLogStreamManager.start('abc123')
    dockerLogStreamManager.start('abc123')

    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  it('broadcasts stdout chunks on the container-scoped data channel', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)
    const { dockerLogStreamManager } = await loadManager()

    dockerLogStreamManager.start('abc123')
    child.stdout.emit('data', Buffer.from('log line 1\n'))

    expect(sendMock).toHaveBeenCalledWith('docker:logs:data:abc123', 'log line 1\n')
  })

  it('broadcasts stderr chunks on the same data channel as real log content', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)
    const { dockerLogStreamManager } = await loadManager()

    dockerLogStreamManager.start('abc123')
    child.stderr.emit('data', Buffer.from('an error logged by the app itself\n'))

    expect(sendMock).toHaveBeenCalledWith('docker:logs:data:abc123', 'an error logged by the app itself\n')
  })

  it('stop() kills the process and a subsequent start() spawns a fresh one', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)
    const { dockerLogStreamManager } = await loadManager()

    dockerLogStreamManager.start('abc123')
    dockerLogStreamManager.stop('abc123')

    expect(child.kill).toHaveBeenCalledTimes(1)

    const child2 = new MockChildProcess()
    spawnMock.mockReturnValue(child2)
    dockerLogStreamManager.start('abc123')

    expect(spawnMock).toHaveBeenCalledTimes(2)
  })

  it('broadcasts a closed event and removes the session when the process exits on its own', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)
    const { dockerLogStreamManager } = await loadManager()

    dockerLogStreamManager.start('abc123')
    child.emit('close')

    expect(sendMock).toHaveBeenCalledWith('docker:logs:closed:abc123')

    const child2 = new MockChildProcess()
    spawnMock.mockReturnValue(child2)
    dockerLogStreamManager.start('abc123')
    expect(spawnMock).toHaveBeenCalledTimes(2)
  })

  it('stopAll() kills every live stream', async () => {
    const childA = new MockChildProcess()
    const childB = new MockChildProcess()
    spawnMock.mockReturnValueOnce(childA).mockReturnValueOnce(childB)
    const { dockerLogStreamManager } = await loadManager()

    dockerLogStreamManager.start('container-a')
    dockerLogStreamManager.start('container-b')
    dockerLogStreamManager.stopAll()

    expect(childA.kill).toHaveBeenCalledTimes(1)
    expect(childB.kill).toHaveBeenCalledTimes(1)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })
})
