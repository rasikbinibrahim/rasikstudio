import type { GitChangeType, GitStatusResult } from '../../../src/types/git'

export type { GitChangeType, GitFileEntry, GitStatusResult } from '../../../src/types/git'

const STATUS_CODE_MAP: Record<string, GitChangeType> = {
  M: 'modified',
  T: 'modified', // type change (e.g. file -> symlink) — no dedicated UI category
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
}

function emptyResult(): GitStatusResult {
  return {
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
  }
}

/** Parses `git status --porcelain=v2 --branch [--find-renames]` output — the only status format
 *  git documents as stable across versions (porcelain v1 is explicitly "may change in the
 *  future," v2 isn't). Every field offset below was verified against a real `git status` run
 *  (see this file's tests), not guessed from the man page alone. Reference:
 *  https://git-scm.com/docs/git-status#_porcelain_format_version_2 */
export function parsePorcelainV2(output: string): GitStatusResult {
  const result = emptyResult()

  for (const line of output.split('\n')) {
    if (!line) continue

    if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length)
      result.branch = head === '(detached)' ? null : head
      continue
    }
    if (line.startsWith('# branch.upstream ')) {
      result.upstream = line.slice('# branch.upstream '.length)
      continue
    }
    if (line.startsWith('# branch.ab ')) {
      const match = /\+(\d+) -(\d+)/.exec(line)
      if (match?.[1] !== undefined && match[2] !== undefined) {
        result.ahead = Number(match[1])
        result.behind = Number(match[2])
      }
      continue
    }
    if (line.startsWith('#')) continue // branch.oid or any other header we don't need

    if (line.startsWith('? ')) {
      result.untracked.push({ path: line.slice(2), status: 'untracked' })
      continue
    }
    if (line.startsWith('! ')) continue // ignored files — never shown in the UI

    if (line.startsWith('u ')) {
      // u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>  — 11 space-separated fields,
      // path is the 11th (index 10). Verified against a real merge-conflict `git status` run.
      const fields = line.split(' ')
      const path = fields.slice(10).join(' ')
      if (path) result.conflicted.push({ path, status: 'conflicted' })
      continue
    }

    if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const fields = line.split(' ')
      const xy = fields[1] ?? '..'
      const x = xy[0]
      const y = xy[1]
      const isRenameOrCopy = line.startsWith('2 ')
      // Type "1": path starts at field index 8. Type "2" (rename/copy) has one extra
      // "<X><score>" field before the path, so it starts at index 9, and is
      // "<path>\t<origPath>" rather than a bare path — both verified against real output.
      const pathField = fields.slice(isRenameOrCopy ? 9 : 8).join(' ')
      const [path, origPath] = pathField.split('\t')
      if (!path) continue

      if (x && x !== '.') {
        result.staged.push({ path, status: STATUS_CODE_MAP[x] ?? 'modified', origPath })
      }
      if (y && y !== '.') {
        result.unstaged.push({ path, status: STATUS_CODE_MAP[y] ?? 'modified', origPath })
      }
    }
  }

  return result
}
