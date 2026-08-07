import { useTerminal } from './useTerminal'

export interface TerminalTabProps {
  terminalId: string
  visible: boolean
}

/** Stays mounted even when not the active tab — only visibility (via `display`) changes — so
 *  the underlying xterm.js instance and its scrollback survive switching tabs. */
export function TerminalTab({ terminalId, visible }: TerminalTabProps): JSX.Element {
  const { containerRef } = useTerminal(terminalId)

  return <div ref={containerRef} className="h-full w-full p-1" style={{ display: visible ? 'block' : 'none' }} />
}
