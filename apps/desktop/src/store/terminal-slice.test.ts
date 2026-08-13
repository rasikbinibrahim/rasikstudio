import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './index'

function stubTerminalApi(): void {
  ;(window as unknown as { rasik: unknown }).rasik = {
    terminal: {
      create: vi.fn(async () => ({ ok: true, data: 'term-1' })),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(async () => ({ ok: true, data: null })),
      onData: vi.fn(() => () => {}),
      onExit: vi.fn(() => () => {}),
    },
  }
}

describe('terminal-slice', () => {
  beforeEach(() => {
    stubTerminalApi()
    useAppStore.setState({ terminals: [], activeTerminalId: null })
  })

  it('renameTerminal updates only the matching session title', async () => {
    await useAppStore.getState().createTerminal()
    const otherId = useAppStore.getState().terminals[0]?.id
    useAppStore.setState((state) => {
      state.terminals.push({ id: 'term-2', title: 'Terminal 2', cwd: '', status: 'active' })
    })

    useAppStore.getState().renameTerminal('term-2', 'vim')

    const terminals = useAppStore.getState().terminals
    expect(terminals.find((t) => t.id === 'term-2')?.title).toBe('vim')
    expect(terminals.find((t) => t.id === otherId)?.title).not.toBe('vim')
  })

  it('renameTerminal ignores an empty title (e.g. a stray OSC reset)', async () => {
    await useAppStore.getState().createTerminal()
    const id = useAppStore.getState().terminals[0]!.id
    const before = useAppStore.getState().terminals[0]!.title

    useAppStore.getState().renameTerminal(id, '')

    expect(useAppStore.getState().terminals[0]!.title).toBe(before)
  })

  it('renameTerminal is a no-op for an unknown terminal id', async () => {
    await useAppStore.getState().createTerminal()
    const before = useAppStore.getState().terminals

    useAppStore.getState().renameTerminal('does-not-exist', 'ssh')

    expect(useAppStore.getState().terminals).toEqual(before)
  })

  it('createTerminal titles the tab from the relative cwd\'s basename when given one', async () => {
    await useAppStore.getState().createTerminal('src/features')

    expect(useAppStore.getState().terminals[0]).toMatchObject({ title: 'features', cwd: 'src/features' })
  })

  it('createTerminal does nothing when the IPC call fails', async () => {
    ;(window as unknown as { rasik: { terminal: { create: ReturnType<typeof vi.fn> } } }).rasik.terminal.create =
      vi.fn(async () => ({ ok: false, error: 'spawn failed' }))

    await useAppStore.getState().createTerminal()

    expect(useAppStore.getState().terminals).toEqual([])
  })

  it('closeTerminal kills the session, removes it, and activates the next one', async () => {
    await useAppStore.getState().createTerminal()
    await useAppStore.getState().createTerminal()
    const [first, second] = useAppStore.getState().terminals
    useAppStore.getState().setActiveTerminal(first!.id)

    useAppStore.getState().closeTerminal(first!.id)

    const rasik = (window as unknown as { rasik: { terminal: { kill: ReturnType<typeof vi.fn> } } }).rasik
    expect(rasik.terminal.kill).toHaveBeenCalledWith(first!.id)
    expect(useAppStore.getState().terminals.map((t) => t.id)).toEqual([second!.id])
    expect(useAppStore.getState().activeTerminalId).toBe(second!.id)
  })

  it('closeTerminal falls back to the previous tab when closing the last one', async () => {
    await useAppStore.getState().createTerminal()
    await useAppStore.getState().createTerminal()
    const [first, second] = useAppStore.getState().terminals
    useAppStore.getState().setActiveTerminal(second!.id)

    useAppStore.getState().closeTerminal(second!.id)

    expect(useAppStore.getState().activeTerminalId).toBe(first!.id)
  })

  it('closeTerminal sets activeTerminalId to null when closing the only tab', async () => {
    await useAppStore.getState().createTerminal()
    const only = useAppStore.getState().terminals[0]!
    useAppStore.getState().setActiveTerminal(only.id)

    useAppStore.getState().closeTerminal(only.id)

    expect(useAppStore.getState().activeTerminalId).toBeNull()
    expect(useAppStore.getState().terminals).toEqual([])
  })

  it('closeTerminal is a no-op for an unknown id', async () => {
    await useAppStore.getState().createTerminal()
    const before = useAppStore.getState().terminals

    useAppStore.getState().closeTerminal('does-not-exist')

    expect(useAppStore.getState().terminals).toEqual(before)
  })

  it('setActiveTerminal switches the active terminal', async () => {
    await useAppStore.getState().createTerminal()
    await useAppStore.getState().createTerminal()
    const second = useAppStore.getState().terminals[1]!

    useAppStore.getState().setActiveTerminal(second.id)

    expect(useAppStore.getState().activeTerminalId).toBe(second.id)
  })

  it('markTerminalExited marks the matching session exited', async () => {
    await useAppStore.getState().createTerminal()
    const id = useAppStore.getState().terminals[0]!.id

    useAppStore.getState().markTerminalExited(id)

    expect(useAppStore.getState().terminals[0]?.status).toBe('exited')
  })
})
