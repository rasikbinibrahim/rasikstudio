import { describe, expect, it } from 'vitest'
import { getGitDecorationForPath } from './git-status-display'
import type { GitStatusResult } from '../../types/git'

function status(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
  return {
    branch: 'main',
    upstream: null,
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
    ...overrides,
  }
}

describe('getGitDecorationForPath', () => {
  it('returns null when there is no status yet', () => {
    expect(getGitDecorationForPath(null, 'a.ts', false)).toBeNull()
  })

  it('returns null for a file with no changes', () => {
    const result = getGitDecorationForPath(status(), 'a.ts', false)

    expect(result).toBeNull()
  })

  it("prefers a file's unstaged status over its staged status", () => {
    const s = status({
      staged: [{ path: 'a.ts', status: 'added' }],
      unstaged: [{ path: 'a.ts', status: 'modified' }],
    })

    expect(getGitDecorationForPath(s, 'a.ts', false)).toBe('modified')
  })

  it('falls back to staged status when there is no unstaged or untracked entry', () => {
    const s = status({ staged: [{ path: 'a.ts', status: 'added' }] })

    expect(getGitDecorationForPath(s, 'a.ts', false)).toBe('added')
  })

  it('reports untracked for a new file', () => {
    const s = status({ untracked: [{ path: 'a.ts', status: 'untracked' }] })

    expect(getGitDecorationForPath(s, 'a.ts', false)).toBe('untracked')
  })

  it('conflicted always wins over any other status for the same path', () => {
    const s = status({
      conflicted: [{ path: 'a.ts', status: 'conflicted' }],
      unstaged: [{ path: 'a.ts', status: 'modified' }],
    })

    expect(getGitDecorationForPath(s, 'a.ts', false)).toBe('conflicted')
  })

  it('returns null for a directory with no changed descendants', () => {
    const s = status({ unstaged: [{ path: 'other/b.ts', status: 'modified' }] })

    expect(getGitDecorationForPath(s, 'src', true)).toBeNull()
  })

  it("decorates a directory with its descendant's status", () => {
    const s = status({ unstaged: [{ path: 'src/nested/b.ts', status: 'modified' }] })

    expect(getGitDecorationForPath(s, 'src', true)).toBe('modified')
  })

  it('does not match a directory whose name is only a string-prefix of another (src vs src-old)', () => {
    const s = status({ unstaged: [{ path: 'src-old/b.ts', status: 'modified' }] })

    expect(getGitDecorationForPath(s, 'src', true)).toBeNull()
  })

  it('decorates a directory as conflicted when any descendant is conflicted, even if others are just modified', () => {
    const s = status({
      unstaged: [{ path: 'src/a.ts', status: 'modified' }],
      conflicted: [{ path: 'src/b.ts', status: 'conflicted' }],
    })

    expect(getGitDecorationForPath(s, 'src', true)).toBe('conflicted')
  })
})
