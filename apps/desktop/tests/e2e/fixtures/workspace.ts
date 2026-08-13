import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

export interface TestWorkspace {
  root: string
  cleanup: () => void
}

/** A real temp directory with real sample files (not fixtures copied from a template — written
 *  fresh per test run) and a real, `git init`-ed repository, so the git/editor/LSP/terminal E2E
 *  flows have something real to operate on. Never touches this repository's own working tree. */
export function createTestWorkspace(): TestWorkspace {
  const root = mkdtempSync(join(tmpdir(), 'rasik-e2e-'))

  writeFileSync(
    join(root, 'index.ts'),
    ['export function greet(name: string): string {', '  return `Hello, ${name}!`', '}', ''].join('\n'),
  )
  writeFileSync(join(root, 'README.md'), '# Test Workspace\n\nCreated by a Playwright E2E test.\n')
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', 'util.ts'), 'export const add = (a: number, b: number): number => a + b\n')

  execFileSync('git', ['init', '--initial-branch=main'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'e2e@rasikstudio.dev'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Rasik E2E'], { cwd: root })
  execFileSync('git', ['add', '.'], { cwd: root })
  execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: root })

  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}
