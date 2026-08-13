import { test, expect, openWorkspace } from './fixtures/electron-app'
import { createTestWorkspace, type TestWorkspace } from './fixtures/workspace'

// Flow 6 of 8 (`phase-16-testing.md`): file search (Ctrl+P) + code navigation
// (go-to-definition, real LSP-backed — Phase 3's `lsp-client.ts`).

let workspace: TestWorkspace

test.beforeEach(() => {
  workspace = createTestWorkspace()
})

test.afterEach(() => {
  workspace.cleanup()
})

test('Ctrl+P quick-opens a file by fuzzy name match', async ({ window }) => {
  await openWorkspace(window, workspace.root)
  await expect(window.getByRole('treeitem', { name: 'index.ts' })).toBeVisible()

  await window.keyboard.press('Control+p')
  await window.getByPlaceholder('Search files by name…').fill('util')

  const result = window.getByRole('option', { name: /util\.ts/ })
  await expect(result).toBeVisible()
  await result.click()

  await expect(window.getByRole('tab', { name: /util\.ts/ })).toHaveAttribute('aria-selected', 'true')
})

test('Ctrl+Shift+P opens the command palette in command mode', async ({ window }) => {
  await window.keyboard.press('Control+Shift+P')

  await expect(window.getByRole('heading', { name: 'Command Palette' })).toBeVisible()
  await expect(window.getByRole('option', { name: 'Toggle Theme' })).toBeVisible()
})

test('a real LSP hover (typescript-language-server) renders over a symbol in an open file', async ({
  window,
}) => {
  await openWorkspace(window, workspace.root)
  await window.getByRole('treeitem', { name: 'index.ts' }).click()

  const editorSurface = window.locator('.monaco-editor')
  await expect(editorSurface).toBeVisible()

  // `greet` on line 1 of the fixture's `index.ts` (see `fixtures/workspace.ts`) — hovering a
  // real symbol should trigger a real `textDocument/hover` request once the LSP server (spawned
  // on demand by `lsp-client.ts`) finishes initializing against this real temp workspace.
  // A real `mouse.move` (not `.hover()`, which can land without a real intervening pointer
  // delta) — Monaco's own hover widget only arms on an actual `mousemove` event over the text.
  const symbol = window.getByText('greet', { exact: true }).first()
  const box = await symbol.boundingBox()
  if (!box) throw new Error('symbol not found in the editor viewport')
  await window.mouse.move(box.x + 1, box.y + 1)
  await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 })

  await expect(window.locator('.monaco-hover:not(.hidden)').first()).toBeVisible({ timeout: 20_000 })
})
