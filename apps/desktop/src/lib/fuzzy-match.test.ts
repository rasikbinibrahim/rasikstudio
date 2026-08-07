import { describe, expect, it } from 'vitest'
import { fuzzyFilter, fuzzyMatch } from './fuzzy-match'

describe('fuzzyMatch', () => {
  it('matches an exact substring', () => {
    expect(fuzzyMatch('file', 'file-explorer.tsx').matched).toBe(true)
  })

  it('matches a non-contiguous subsequence', () => {
    expect(fuzzyMatch('fe', 'file-explorer.tsx').matched).toBe(true)
  })

  it('does not match when a required character is missing', () => {
    const result = fuzzyMatch('fez', 'file-explorer.tsx')
    expect(result.matched).toBe(false)
    expect(result.score).toBe(0)
    expect(result.indices).toEqual([])
  })

  it('matches everything for an empty query', () => {
    const result = fuzzyMatch('', 'anything.ts')
    expect(result.matched).toBe(true)
    expect(result.score).toBe(0)
  })

  it('is case-insensitive', () => {
    expect(fuzzyMatch('FILE', 'file.ts').matched).toBe(true)
    expect(fuzzyMatch('file', 'FILE.TS').matched).toBe(true)
  })

  it('scores a match at the start of a word higher than a mid-word match', () => {
    const atStart = fuzzyMatch('ex', 'explorer.ts')
    const midWord = fuzzyMatch('ex', 'flexer.ts')
    expect(atStart.matched).toBe(true)
    expect(midWord.matched).toBe(true)
    expect(atStart.score).toBeGreaterThan(midWord.score)
  })

  it('records the matched character indices', () => {
    expect(fuzzyMatch('ab', 'a-b').indices).toEqual([0, 2])
  })
})

describe('fuzzyFilter', () => {
  const items = ['zebra', 'main.ts', 'mainxyz.ts', 'aardvark']

  it('returns all items unchanged for an empty query', () => {
    expect(fuzzyFilter('', items, (s) => s)).toEqual(items)
  })

  it('filters out items with no matching subsequence', () => {
    expect(fuzzyFilter('qqq', items, (s) => s)).toEqual([])
  })

  it('ranks a tighter match before a looser one', () => {
    const result = fuzzyFilter('main', items, (s) => s)
    expect(result[0]).toBe('main.ts')
    expect(result).toContain('mainxyz.ts')
    expect(result).not.toContain('zebra')
    expect(result).not.toContain('aardvark')
  })
})
