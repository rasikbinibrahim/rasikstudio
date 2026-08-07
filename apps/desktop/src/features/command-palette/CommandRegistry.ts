import type { Command } from './command-types'

/** Holds every command available to the palette. Instantiate directly in tests for isolation;
 *  the app uses the shared `commandRegistry` singleton below. */
export class CommandRegistry {
  private readonly commands = new Map<string, Command>()

  /** Registers a command. Returns an unregister function for cleanup (e.g. in a useEffect). */
  register(command: Command): () => void {
    if (this.commands.has(command.id)) {
      throw new Error(`Command already registered: ${command.id}`)
    }
    this.commands.set(command.id, command)
    return () => this.unregister(command.id)
  }

  unregister(id: string): void {
    this.commands.delete(id)
  }

  get(id: string): Command | undefined {
    return this.commands.get(id)
  }

  getAll(): Command[] {
    return Array.from(this.commands.values())
  }

  async execute(id: string): Promise<void> {
    const command = this.commands.get(id)
    if (!command) {
      throw new Error(`Unknown command: ${id}`)
    }
    await command.run()
  }

  findByKeybinding(keybinding: string): Command | undefined {
    return this.getAll().find((command) => command.keybinding === keybinding)
  }
}

export const commandRegistry = new CommandRegistry()
