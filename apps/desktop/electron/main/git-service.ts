import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { parsePorcelainV2 } from './lib/git-status-parser'
import type { GitBranch, GitLogEntry, GitStatusResult } from '../../src/types/git'

const execFileAsync = promisify(execFile)

const MAX_BUFFER_BYTES = 10 * 1024 * 1024 // a diff on a large generated file can be big; 10MB is generous

export class GitCommandError extends Error {}

/** Thin wrapper over the `git` CLI via `execFile` — never `exec`/`execSync` with a shell string,
 *  same "no shell interpolation of user-influenced input" rule `run_command` (the backend agent
 *  tool) already follows. One instance per open workspace, `cwd` fixed to the workspace root at
 *  construction so every command implicitly runs inside it. Per `phase-12-git-integration.md`'s
 *  ADR 0008: CLI subprocess, not `libgit2` bindings — no native module to compile per platform. */
export class GitService {
  constructor(private readonly cwd: string) {}

  private async run(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd: this.cwd,
        maxBuffer: MAX_BUFFER_BYTES,
      })
      return stdout
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new GitCommandError(message)
    }
  }

  async status(): Promise<GitStatusResult> {
    const output = await this.run(['status', '--porcelain=v2', '--branch', '--find-renames'])
    return parsePorcelainV2(output)
  }

  async stage(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    await this.run(['add', '--', ...paths])
  }

  async unstage(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    try {
      await this.run(['restore', '--staged', '--', ...paths])
    } catch (err) {
      // `git restore --staged` resolves against HEAD, which doesn't exist yet in a brand-new
      // repository before its first commit — real, not hypothetical: "git init, stage a file,
      // change your mind" is a normal first-run sequence. `git rm --cached` un-adds a path from
      // the index without needing a HEAD to restore from.
      if (err instanceof GitCommandError && err.message.includes('could not resolve HEAD')) {
        await this.run(['rm', '-q', '--cached', '--', ...paths])
        return
      }
      throw err
    }
  }

  async commit(message: string): Promise<void> {
    await this.run(['commit', '-m', message])
  }

  async diff(staged: boolean, filePath?: string): Promise<string> {
    const args = ['diff']
    if (staged) args.push('--staged')
    if (filePath) args.push('--', filePath)
    return this.run(args)
  }

  async log(limit = 50, branch?: string): Promise<GitLogEntry[]> {
    // \x1f (unit separator) can't appear in a commit subject, unlike a colon/pipe a real commit
    // message could plausibly contain — a safer field delimiter than the more common `|`.
    const args = ['log', `-n${limit}`, '--pretty=format:%H\x1f%s']
    if (branch) args.push(branch)
    const output = await this.run(args)
    if (!output.trim()) return []
    return output.split('\n').map((line) => {
      const [hash, ...rest] = line.split('\x1f')
      return { hash: hash ?? '', message: rest.join('\x1f') }
    })
  }

  async branches(): Promise<GitBranch[]> {
    const output = await this.run(['branch', '--all', '--format=%(refname:short)%09%(HEAD)'])
    return output
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const [name = '', head] = line.split('\t')
        return { name, current: head === '*', remote: name.startsWith('remotes/') }
      })
  }

  /** `ref` is typically `HEAD` (last commit) or `''` (the index/staged blob, i.e. `git show
   *  :<path>`) — the two "before" versions `DiffViewer.tsx` needs alongside the working-tree
   *  file it already has via `files:read`. Returns `''` (not an error) when the file doesn't
   *  exist at that ref — a new/untracked file simply has no prior version, which is a normal
   *  case for a diff viewer to render (everything shows as added), not a failure. */
  async showFile(ref: string, filePath: string): Promise<string> {
    try {
      return await this.run(['show', `${ref}:${filePath}`])
    } catch {
      return ''
    }
  }

  async checkout(branch: string): Promise<void> {
    await this.run(['checkout', branch])
  }

  async push(): Promise<string> {
    return this.run(['push'])
  }

  async pull(): Promise<string> {
    return this.run(['pull'])
  }
}
