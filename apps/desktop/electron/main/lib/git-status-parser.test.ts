import { describe, expect, it } from 'vitest'
import { parsePorcelainV2 } from './git-status-parser'

// Every fixture below is real `git status --porcelain=v2 --branch [--find-renames]` output,
// captured from an actual git 2.43 run against a scratch repository — not hand-written from the
// man page, since the exact field offsets (especially for rename/copy and unmerged lines) are
// easy to get subtly wrong from the docs alone.

describe('parsePorcelainV2', () => {
  it('parses branch name from branch.head', () => {
    const result = parsePorcelainV2('# branch.oid abc123\n# branch.head main\n')

    expect(result.branch).toBe('main')
  })

  it('reports a detached HEAD as no branch, not the literal "(detached)" string', () => {
    const result = parsePorcelainV2('# branch.oid abc123\n# branch.head (detached)\n')

    expect(result.branch).toBeNull()
  })

  it('parses the upstream and ahead/behind counts', () => {
    const result = parsePorcelainV2(
      '# branch.oid abc\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -1\n',
    )

    expect(result.upstream).toBe('origin/main')
    expect(result.ahead).toBe(2)
    expect(result.behind).toBe(1)
  })

  it('categorizes a deleted-and-staged file plus an added-and-modified file, plus an untracked file', () => {
    const output = [
      '# branch.oid 3c99d11fedd48a916fe02aea3a39d95052b9fed8',
      '# branch.head main',
      '1 D. N... 100644 000000 000000 78981922613b2afb6025042ff6bd878ac1994e85 0000000000000000000000000000000000000000 a.txt',
      '1 AM N... 000000 100644 100644 0000000000000000000000000000000000000000 9ad2ebbaff6f3397bb65002dcf4294d8d6243982 c.txt',
      '? b.txt',
      '',
    ].join('\n')

    const result = parsePorcelainV2(output)

    expect(result.staged).toEqual([
      { path: 'a.txt', status: 'deleted', origPath: undefined },
      { path: 'c.txt', status: 'added', origPath: undefined },
    ])
    expect(result.unstaged).toEqual([{ path: 'c.txt', status: 'modified', origPath: undefined }])
    expect(result.untracked).toEqual([{ path: 'b.txt', status: 'untracked' }])
  })

  it('parses a staged rename (type "2" entry) into path + origPath', () => {
    const line =
      '2 R. N... 100644 100644 100644 b3c5a95f929a50feb06c275ac567cdb1b441d1e2 b3c5a95f929a50feb06c275ac567cdb1b441d1e2 R100 renamed.txt\torig.txt'
    const output = `# branch.oid abc\n# branch.head main\n${line}\n`

    const result = parsePorcelainV2(output)

    expect(result.staged).toEqual([
      { path: 'renamed.txt', status: 'renamed', origPath: 'orig.txt' },
    ])
  })

  it('parses an unmerged (conflicted) entry — path is the 11th space-separated field', () => {
    const line =
      'u UU N... 100644 100644 100644 100644 e3990a77e96666ba79ac06111c5723cda3a79cc9 065e9d1c71aa492e9588ac906ff84e1b552aa388 8647c5d0268eabfbfb6bc65b30678570c2df4583 c.txt'
    const output = `# branch.oid abc\n# branch.head main\n${line}\n`

    const result = parsePorcelainV2(output)

    expect(result.conflicted).toEqual([{ path: 'c.txt', status: 'conflicted' }])
  })

  it('ignores "!" ignored-file lines', () => {
    const output = '# branch.oid abc\n# branch.head main\n! dist/bundle.js\n'

    const result = parsePorcelainV2(output)

    expect(result.staged).toHaveLength(0)
    expect(result.unstaged).toHaveLength(0)
    expect(result.untracked).toHaveLength(0)
  })

  it('returns an all-empty result for a clean repo with no upstream', () => {
    const result = parsePorcelainV2('# branch.oid abc\n# branch.head main\n')

    expect(result).toEqual({
      branch: 'main',
      upstream: null,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      untracked: [],
      conflicted: [],
    })
  })
})
