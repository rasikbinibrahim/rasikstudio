import { describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from './CommandRegistry'

describe('CommandRegistry', () => {
  it('registers and retrieves a command', () => {
    const registry = new CommandRegistry()
    registry.register({ id: 'test.command', title: 'Test Command', run: vi.fn() })

    expect(registry.get('test.command')?.title).toBe('Test Command')
    expect(registry.getAll()).toHaveLength(1)
  })

  it('throws when registering a duplicate id', () => {
    const registry = new CommandRegistry()
    registry.register({ id: 'dup', title: 'A', run: vi.fn() })

    expect(() => registry.register({ id: 'dup', title: 'B', run: vi.fn() })).toThrow(
      'Command already registered: dup',
    )
  })

  it('unregisters via the returned function', () => {
    const registry = new CommandRegistry()
    const unregister = registry.register({ id: 'temp', title: 'Temp', run: vi.fn() })

    unregister()

    expect(registry.get('temp')).toBeUndefined()
  })

  it('executes the command by id', async () => {
    const registry = new CommandRegistry()
    const run = vi.fn()
    registry.register({ id: 'run.me', title: 'Run Me', run })

    await registry.execute('run.me')

    expect(run).toHaveBeenCalledOnce()
  })

  it('rejects executing an unknown command', async () => {
    const registry = new CommandRegistry()
    await expect(registry.execute('missing')).rejects.toThrow('Unknown command: missing')
  })

  it('finds a command by its keybinding', () => {
    const registry = new CommandRegistry()
    registry.register({ id: 'save', title: 'Save', keybinding: 'Ctrl+S', run: vi.fn() })

    expect(registry.findByKeybinding('Ctrl+S')?.id).toBe('save')
    expect(registry.findByKeybinding('Ctrl+Z')).toBeUndefined()
  })
})
