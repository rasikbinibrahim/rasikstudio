export interface Command {
  id: string
  title: string
  category?: string
  keybinding?: string
  run: () => void | Promise<void>
}
