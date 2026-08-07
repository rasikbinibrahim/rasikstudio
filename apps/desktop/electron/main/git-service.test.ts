import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GitCommandError, GitService } from './git-service'

const execFileAsync = promisify(execFile)

// Runs against a real, throwaway git repository (same "real behavior beats a mock" standard
// pty-manager.test.ts already established for this codebase's Electron-main tests) — GitService
// is a thin CLI wrapper, so the only thing worth verifying is that it invokes real `git` correctly
// and parses real output, not that a mock returns what we told it to.

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rasik-git-test-'))
  await execFileAsync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  return dir
}

describe('GitService', () => {
  let dir: string
  let service: GitService

  beforeEach(async () => {
    dir = await initRepo()
    service = new GitService(dir)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reports an untracked file in a fresh repo', async () => {
    await writeFile(join(dir, 'a.txt'), 'hello\n')

    const status = await service.status()

    expect(status.branch).toBe('main')
    expect(status.untracked).toEqual([{ path: 'a.txt', status: 'untracked' }])
    expect(status.staged).toHaveLength(0)
  })

  it('stage() moves a file from untracked to staged', async () => {
    await writeFile(join(dir, 'a.txt'), 'hello\n')

    await service.stage(['a.txt'])
    const status = await service.status()

    expect(status.untracked).toHaveLength(0)
    expect(status.staged).toEqual([{ path: 'a.txt', status: 'added', origPath: undefined }])
  })

  it('unstage() moves a file back out of staged, in a repo with prior commits', async () => {
    await writeFile(join(dir, 'base.txt'), 'base\n')
    await service.stage(['base.txt'])
    await service.commit('base')
    await writeFile(join(dir, 'a.txt'), 'hello\n')
    await service.stage(['a.txt'])

    await service.unstage(['a.txt'])
    const status = await service.status()

    expect(status.staged).toHaveLength(0)
    expect(status.untracked).toEqual([{ path: 'a.txt', status: 'untracked' }])
  })

  it('unstage() also works before the first commit, when HEAD does not exist yet', async () => {
    await writeFile(join(dir, 'a.txt'), 'hello\n')
    await service.stage(['a.txt'])

    await service.unstage(['a.txt'])
    const status = await service.status()

    expect(status.staged).toHaveLength(0)
    expect(status.untracked).toEqual([{ path: 'a.txt', status: 'untracked' }])
  })

  it('commit() creates a real commit visible in git log', async () => {
    await writeFile(join(dir, 'a.txt'), 'hello\n')
    await service.stage(['a.txt'])

    await service.commit('add a.txt')
    const log = await service.log()

    expect(log).toHaveLength(1)
    expect(log[0]?.message).toBe('add a.txt')
  })

  it('log() returns entries oldest-message-last, hash + subject parsed correctly', async () => {
    await writeFile(join(dir, 'a.txt'), '1\n')
    await service.stage(['a.txt'])
    await service.commit('first')
    await writeFile(join(dir, 'a.txt'), '2\n')
    await service.stage(['a.txt'])
    await service.commit('second')

    const log = await service.log()

    expect(log.map((entry) => entry.message)).toEqual(['second', 'first'])
    expect(log[0]?.hash).toMatch(/^[0-9a-f]{40}$/)
  })

  it('diff() shows the staged diff for a modified file', async () => {
    await writeFile(join(dir, 'a.txt'), 'line1\n')
    await service.stage(['a.txt'])
    await service.commit('init')
    await writeFile(join(dir, 'a.txt'), 'line1\nline2\n')
    await service.stage(['a.txt'])

    const diff = await service.diff(true)

    expect(diff).toContain('+line2')
  })

  it('showFile() returns the committed content of a file at HEAD', async () => {
    await writeFile(join(dir, 'a.txt'), 'v1\n')
    await service.stage(['a.txt'])
    await service.commit('v1')
    await writeFile(join(dir, 'a.txt'), 'v2\n')

    const atHead = await service.showFile('HEAD', 'a.txt')

    expect(atHead).toBe('v1\n')
  })

  it('showFile() returns an empty string for a file that does not exist at that ref', async () => {
    await writeFile(join(dir, 'new.txt'), 'brand new\n')

    const atHead = await service.showFile('HEAD', 'new.txt')

    expect(atHead).toBe('')
  })

  it('branches() lists the current branch, marked current', async () => {
    await writeFile(join(dir, 'a.txt'), 'hello\n')
    await service.stage(['a.txt'])
    await service.commit('init')

    const branches = await service.branches()

    expect(branches).toEqual([{ name: 'main', current: true, remote: false }])
  })

  it('a real merge conflict is reported under conflicted, not staged/unstaged', async () => {
    await writeFile(join(dir, 'c.txt'), 'base\n')
    await service.stage(['c.txt'])
    await service.commit('base')

    await execFileAsync('git', ['checkout', '-q', '-b', 'feature'], { cwd: dir })
    await writeFile(join(dir, 'c.txt'), 'feature\n')
    await execFileAsync('git', ['commit', '-q', '-am', 'feature change'], { cwd: dir })
    await execFileAsync('git', ['checkout', '-q', 'main'], { cwd: dir })
    await writeFile(join(dir, 'c.txt'), 'main\n')
    await execFileAsync('git', ['commit', '-q', '-am', 'main change'], { cwd: dir })
    await execFileAsync('git', ['merge', 'feature'], { cwd: dir }).catch(() => undefined)

    const status = await service.status()

    expect(status.conflicted).toEqual([{ path: 'c.txt', status: 'conflicted' }])
  })

  it('rejects a bad git invocation with GitCommandError rather than throwing a raw exec error', async () => {
    await expect(service.checkout('no-such-branch')).rejects.toBeInstanceOf(GitCommandError)
  })
})
