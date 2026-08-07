import { describe, expect, it } from 'vitest'
import { hasConflictMarkers, joinSegments, parseConflictMarkers } from './conflict-parser'

describe('parseConflictMarkers', () => {
  it('returns a single text segment for content with no conflict markers', () => {
    const segments = parseConflictMarkers('line1\nline2\n')

    expect(segments).toEqual([{ type: 'text', content: 'line1\nline2\n' }])
  })

  it('splits surrounding text from a single conflict block', () => {
    const content = ['before', '<<<<<<< HEAD', 'mine', '=======', 'theirs', '>>>>>>> feature', 'after'].join(
      '\n',
    )

    const segments = parseConflictMarkers(content)

    expect(segments).toEqual([
      { type: 'text', content: 'before' },
      { type: 'conflict', oursLabel: 'HEAD', ours: 'mine', theirsLabel: 'feature', theirs: 'theirs' },
      { type: 'text', content: 'after' },
    ])
  })

  it('handles multiple conflict blocks in one file', () => {
    const content = [
      '<<<<<<< HEAD',
      'a1',
      '=======',
      'a2',
      '>>>>>>> feature',
      'middle',
      '<<<<<<< HEAD',
      'b1',
      '=======',
      'b2',
      '>>>>>>> feature',
    ].join('\n')

    const segments = parseConflictMarkers(content)

    expect(segments.filter((s) => s.type === 'conflict')).toHaveLength(2)
    expect(segments).toContainEqual({ type: 'text', content: 'middle' })
  })

  it('treats a multi-line ours/theirs block correctly', () => {
    const content = ['<<<<<<< HEAD', 'line1', 'line2', '=======', 'line3', '>>>>>>> feature'].join('\n')

    const segments = parseConflictMarkers(content)

    expect(segments[0]).toEqual({
      type: 'conflict',
      oursLabel: 'HEAD',
      ours: 'line1\nline2',
      theirsLabel: 'feature',
      theirs: 'line3',
    })
  })

  it('treats an unterminated conflict marker as plain text rather than swallowing the file', () => {
    const content = ['<<<<<<< HEAD', 'mine', 'no closing markers here'].join('\n')

    const segments = parseConflictMarkers(content)

    expect(segments).toEqual([{ type: 'text', content }])
  })
})

describe('hasConflictMarkers', () => {
  it('is false for clean content', () => {
    expect(hasConflictMarkers('a\nb\n')).toBe(false)
  })

  it('is true when a conflict block is present', () => {
    expect(hasConflictMarkers('<<<<<<< HEAD\na\n=======\nb\n>>>>>>> feature\n')).toBe(true)
  })
})

describe('joinSegments', () => {
  it('reconstructs the original content when no conflicts existed', () => {
    const original = 'line1\nline2\nline3'
    const segments = parseConflictMarkers(original)

    expect(joinSegments(segments)).toBe(original)
  })

  it('reconstructs resolved content after a conflict segment is replaced with chosen text', () => {
    const content = ['before', '<<<<<<< HEAD', 'mine', '=======', 'theirs', '>>>>>>> feature', 'after'].join(
      '\n',
    )
    const segments = parseConflictMarkers(content)
    const resolved = segments.map((segment) =>
      segment.type === 'conflict' ? { type: 'text' as const, content: segment.ours } : segment,
    )

    expect(joinSegments(resolved)).toBe('before\nmine\nafter')
  })
})
