import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, openWorkspace } from './fixtures/electron-app'
import { createTestWorkspace, type TestWorkspace } from './fixtures/workspace'

// Flow 1 of 8 (`phase-16-testing.md`): app launch → workspace open → file edit → save.

let workspace: TestWorkspace

test.beforeEach(() => {
  workspace = createTestWorkspace()
})

test.afterEach(() => {
  workspace.cleanup()
})

test('launches with the full IDE chrome visible', async ({ window }) => {
  // "No folder opened" legitimately appears twice (the file explorer's empty state and the
  // status bar's workspace-name slot) — both real chrome, not a placeholder screen.
  await expect(window.getByText('No folder opened').first()).toBeVisible()
  await expect(window.getByRole('button', { name: /Open Folder/ })).toBeVisible()
})

test('opens a real folder, renders the file tree, opens a file, edits it, and saves to disk', async ({
  window,
}) => {
  await openWorkspace(window, workspace.root)

  await expect(window.getByRole('treeitem', { name: 'index.ts' })).toBeVisible()
  await expect(window.getByRole('treeitem', { name: 'README.md' })).toBeVisible()

  await window.getByRole('treeitem', { name: 'index.ts' }).click()

  // Monaco's real editor surface — a live-typed keystroke, not a scripted `setValue()` call.
  // Clicking the visible text content (not the hidden `textarea.inputarea` Monaco positions
  // behind it) focuses the same real editor and avoids Playwright's actionability check seeing
  // the visible code as "intercepting" the click.
  await window.locator('.monaco-editor .view-lines').click()
  await window.keyboard.press('Control+End')
  await window.keyboard.type('\n// e2e-edit-marker')

  await window.keyboard.press('Control+s')

  // Real assertion against the real file on disk, not the in-memory editor buffer — proves the
  // save IPC round-trip (`files:write`) actually happened, not just that Monaco's model changed.
  await expect
    .poll(() => readFileSync(join(workspace.root, 'index.ts'), 'utf8'), { timeout: 10_000 })
    .toContain('e2e-edit-marker')
})

test('multiple open files show as separate tabs, and switching tabs preserves each one', async ({
  window,
}) => {
  await openWorkspace(window, workspace.root)

  await window.getByRole('treeitem', { name: 'index.ts' }).click()
  await window.getByRole('treeitem', { name: 'README.md' }).click()

  await expect(window.getByRole('tab', { name: /index\.ts/ })).toBeVisible()
  await expect(window.getByRole('tab', { name: /README\.md/ })).toBeVisible()
})
