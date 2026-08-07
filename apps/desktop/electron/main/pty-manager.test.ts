import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface ExitEvent {
  exitCode: number
  signal?: number
}

interface MockPty {
  write: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  onData: ReturnType<typeof vi.fn>
  onExit: ReturnType<typeof vi.fn>
  emitData: (data: string) => void
  emitExit: (event: ExitEvent) => void
}

function createMockPty(): MockPty {
  let dataHandler: ((data: string) => void) | undefined
  let exitHandler: ((event: ExitEvent) => void) | undefined

  return {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn((cb: (data: string) => void) => {
      dataHandler = cb
      return { dispose: vi.fn() }
    }),
    onExit: vi.fn((cb: (event: ExitEvent) => void) => {
      exitHandler = cb
      return { dispose: vi.fn() }
    }),
    emitData: (data) => dataHandler?.(data),
    emitExit: (event) => exitHandler?.(event),
  }
}

const spawnMock = vi.fn()
const sendMock = vi.fn()
const getAllWindowsMock = vi.fn(() => [{ webContents: { send: sendMock } }])

vi.mock('node-pty', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => getAllWindowsMock(),
  },
}))

describe('PtyManager', () => {
  beforeEach(() => {
    vi.resetModules()
    spawnMock.mockReset()
    sendMock.mockReset()
    getAllWindowsMock.mockReset()
    getAllWindowsMock.mockReturnValue([{ webContents: { send: sendMock } }])
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function loadManager(): Promise<typeof import('./pty-manager')> {
    return import('./pty-manager')
  }

  it('spawns a shell in the given cwd and returns a unique session id', async () => {
    const mockPty = createMockPty()
    spawnMock.mockReturnValue(mockPty)
    const { ptyManager } = await loadManager()

    const id = ptyManager.create({ cwd: '/workspace/project' })

    expect(id).toEqual(expect.any(String))
    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [shell, args, options] = spawnMock.mock.calls[0] as [string, string[], Record<string, unknown>]
    expect(shell).toEqual(expect.any(String))
    expect(args).toEqual([])
    expect(options['cwd']).toBe('/workspace/project')

    const id2 = ptyManager.create({ cwd: '/workspace/project' })
    expect(id2).not.toBe(id)
  })

  it('uses the explicit shell override when provided instead of the platform default', async () => {
    const mockPty = createMockPty()
    spawnMock.mockReturnValue(mockPty)
    const { ptyManager } = await loadManager()

    ptyManager.create({ cwd: '/workspace', shell: '/usr/bin/zsh' })

    const [shell] = spawnMock.mock.calls[0] as [string]
    expect(shell).toBe('/usr/bin/zsh')
  })

  it('uses command/args instead of a shell when a command override is provided', async () => {
    const mockPty = createMockPty()
    spawnMock.mockReturnValue(mockPty)
    const { ptyManager } = await loadManager()

    ptyManager.create({ cwd: '/workspace', command: 'docker', args: ['exec', '-it', 'abc123', '/bin/sh'] })

    const [command, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(command).toBe('docker')
    expect(args).toEqual(['exec', '-it', 'abc123', '/bin/sh'])
  })

  it('broadcasts PTY output to every open window on the session-scoped data channel', async () => {
    const mockPty = createMockPty()
    spawnMock.mockReturnValue(mockPty)
    const { ptyManager } = await loadManager()

    const id = ptyManager.create({ cwd: '/workspace' })
    mockPty.emitData('hello world\r\n')

    expect(sendMock).toHaveBeenCalledWith(`terminal:data:${id}`, 'hello world\r\n')
  })

  it('forwards writes to the underlying PTY for a known session', async () => {
    const mockPty = createMockPty()
    spawnMock.mockReturnValue(mockPty)
    const { ptyManager } = await loadManager()

    const id = ptyManager.create({ cwd: '/workspace' })
    ptyManager.write(id, 'ls -la\n')

    expect(mockPty.write).toHaveBeenCalledWith('ls -la\n')
  })

  it('silently ignores writes to an unknown session id', async () => {
    const { ptyManager } = await loadManager()
    expect(() => ptyManager.write('does-not-exist', 'x')).not.toThrow()
  })

  it('resizes the underlying PTY for positive dimensions', async () => {
    const mockPty = createMockPty()
    spawnMock.mockReturnValue(mockPty)
    const { ptyManager } = await loadManager()

    const id = ptyManager.create({ cwd: '/workspace' })
    ptyManager.resize(id, 120, 40)

    expect(mockPty.resize).toHaveBeenCalledWith(120, 40)
  })

  it('rejects non-positive resize dimensions without calling the underlying PTY', async () => {
    const mockPty = createMockPty()
    spawnMock.mockReturnValue(mockPty)
    const { ptyManager } = await loadManager()

    const id = ptyManager.create({ cwd: '/workspace' })
    ptyManager.resize(id, 0, 40)
    ptyManager.resize(id, 80, -1)

    expect(mockPty.resize).not.toHaveBeenCalled()
  })

  it('kills the PTY process and removes the session so further writes are no-ops', async () => {
    const mockPty = createMockPty()
    spawnMock.mockReturnValue(mockPty)
    const { ptyManager } = await loadManager()

    const id = ptyManager.create({ cwd: '/workspace' })
    ptyManager.kill(id)

    expect(mockPty.kill).toHaveBeenCalledTimes(1)

    ptyManager.write(id, 'ls\n')
    expect(mockPty.write).not.toHaveBeenCalled()
  })

  it('cleans up the session and broadcasts an exit event when the PTY process exits on its own', async () => {
    const mockPty = createMockPty()
    spawnMock.mockReturnValue(mockPty)
    const { ptyManager } = await loadManager()

    const id = ptyManager.create({ cwd: '/workspace' })
    mockPty.emitExit({ exitCode: 0 })

    expect(sendMock).toHaveBeenCalledWith(`terminal:exit:${id}`, 0)

    ptyManager.write(id, 'ls\n')
    expect(mockPty.write).not.toHaveBeenCalled()
  })

  it('killAll kills every live session, leaving none behind', async () => {
    const ptyA = createMockPty()
    const ptyB = createMockPty()
    spawnMock.mockReturnValueOnce(ptyA).mockReturnValueOnce(ptyB)
    const { ptyManager } = await loadManager()

    ptyManager.create({ cwd: '/workspace/a' })
    ptyManager.create({ cwd: '/workspace/b' })
    ptyManager.killAll()

    expect(ptyA.kill).toHaveBeenCalledTimes(1)
    expect(ptyB.kill).toHaveBeenCalledTimes(1)
  })
})
