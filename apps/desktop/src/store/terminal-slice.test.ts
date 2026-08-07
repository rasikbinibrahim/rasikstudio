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
})
