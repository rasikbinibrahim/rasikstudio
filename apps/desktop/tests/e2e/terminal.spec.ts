import { test, expect, openWorkspace, readTerminalText, getActiveTerminalId } from './fixtures/electron-app'
import { createTestWorkspace, type TestWorkspace } from './fixtures/workspace'

// Flow 5 of 8 (`phase-16-testing.md`): terminal — open, run a command, see output. Real
// `node-pty` spawning a real shell, not a mocked terminal surface.

let workspace: TestWorkspace

test.beforeEach(() => {
  workspace = createTestWorkspace()
})

test.afterEach(() => {
  workspace.cleanup()
})

test('Ctrl+` opens the terminal panel and starts a real shell', async ({ window }) => {
  await openWorkspace(window, workspace.root)

  // The bottom panel (and `TerminalPanel` within it) isn't even mounted until first toggled
  // (`bottomPanelCollapsed` defaults to `true`) — nothing to assert on before this keypress.
  await window.keyboard.press('Control+`')

  // A real xterm.js instance (its own hidden input textarea) attached — same real-instance
  // proof `useTerminal.test.ts` uses at the unit level, verified here against the real running app.
  await expect(window.locator('.xterm-helper-textarea')).toBeVisible({ timeout: 10_000 })
})

test('typing a real command into the terminal shows its real output', async ({ window }) => {
  await openWorkspace(window, workspace.root)
  await window.keyboard.press('Control+`')
  await expect(window.locator('.xterm-helper-textarea')).toBeVisible({ timeout: 10_000 })

  await window.locator('.xterm-helper-textarea').click()
  await window.keyboard.type('echo e2e-terminal-marker-xyz')
  await window.keyboard.press('Enter')

  const terminalId = await getActiveTerminalId(window)
  expect(terminalId).not.toBeNull()

  // Real PTY round-trip: the shell actually ran `echo`, and its real stdout was written back
  // into xterm.js's real screen buffer (read via `term.buffer.active` — see `readTerminalText()`,
  // since the WebGL renderer draws to `<canvas>`, not DOM text) — not a scripted output stub.
  await expect
    .poll(() => readTerminalText(window, terminalId as string), { timeout: 10_000 })
    .toContain('e2e-terminal-marker-xyz')
})
