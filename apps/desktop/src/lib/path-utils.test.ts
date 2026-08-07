import { describe, expect, it } from 'vitest'
import { basename, dirname, joinPath } from './path-utils'

describe('basename', () => {
  it('returns the final segment of a forward-slash path', () => {
    expect(basename('src/features/chat/ChatPanel.tsx')).toBe('ChatPanel.tsx')
  })

  it('returns the final segment of a backslash path', () => {
    expect(basename('src\\features\\chat\\ChatPanel.tsx')).toBe('ChatPanel.tsx')
  })

  it('returns the path itself for a single segment', () => {
    expect(basename('README.md')).toBe('README.md')
  })
})

describe('dirname', () => {
  it('returns the parent directory of a nested path', () => {
    expect(dirname('src/features/chat/ChatPanel.tsx')).toBe('src/features/chat')
  })

  it('returns the workspace root marker for a top-level file', () => {
    expect(dirname('README.md')).toBe('')
  })

  it('normalizes backslash separators to forward slashes', () => {
    expect(dirname('src\\features\\chat\\ChatPanel.tsx')).toBe('src/features/chat')
  })
})

describe('joinPath', () => {
  it('joins a non-empty parent and a name', () => {
    expect(joinPath('src/features/chat', 'NewFile.tsx')).toBe('src/features/chat/NewFile.tsx')
  })

  it('returns just the name when the parent is the workspace root', () => {
    expect(joinPath('', 'README.md')).toBe('README.md')
  })

  it('round-trips with dirname/basename', () => {
    const path = 'src/features/chat/ChatPanel.tsx'
    expect(joinPath(dirname(path), basename(path))).toBe(path)
  })
})
