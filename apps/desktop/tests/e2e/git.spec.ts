import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { test, expect, openWorkspace } from './fixtures/electron-app'
import { createTestWorkspace, type TestWorkspace } from './fixtures/workspace'

// Flow 4 of 8 (`phase-16-testing.md`): git stage → commit → verify with `git log`.

let workspace: TestWorkspace

test.beforeEach(() => {
  workspace = createTestWorkspace()
})

test.afterEach(() => {
  workspace.cleanup()
})

test('stages an unstaged file and commits it, verified with a real `git log`', async ({ window }) => {
  await openWorkspace(window, workspace.root)

  // A real, uncommitted change to a tracked file — git-status-parser.ts's "unstaged" category.
  appendFileSync(join(workspace.root, 'README.md'), '\nAn E2E-made change.\n')

  await window.keyboard.press('Control+Shift+G')
  await expect(window.getByText('README.md')).toBeVisible({ timeout: 10_000 })

  // `GitFileItem`'s stage toggle (`GitStatusSection`'s `toggleLabel="+"`, per `GitPanel.tsx`).
  await window.getByRole('button', { name: '+' }).click()

  const commitMessageInput = window.getByPlaceholder('Commit message')
  await commitMessageInput.fill('test: e2e commit')
  await window.getByRole('button', { name: /^Commit/ }).click()

  // Real assertion via the real `git` CLI against the real repository — not the UI's own claim
  // that the commit succeeded.
  await expect
    .poll(
      () => execFileSync('git', ['log', '--oneline', '-1'], { cwd: workspace.root }).toString(),
      { timeout: 10_000 },
    )
    .toContain('test: e2e commit')
})

test('the branch switcher shows the real current branch', async ({ window }) => {
  await openWorkspace(window, workspace.root)

  await window.keyboard.press('Control+Shift+G')

  // "main" legitimately appears twice (the Git panel's own `BranchSwitcher` trigger and the
  // status bar's branch indicator, both real) — `createTestWorkspace()` `git init
  // --initial-branch=main`s the fixture repo.
  await expect(window.getByRole('button', { name: /main/ }).first()).toBeVisible({ timeout: 10_000 })
})
