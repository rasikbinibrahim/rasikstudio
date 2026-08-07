export interface FuzzyMatchResult {
  matched: boolean
  score: number
  indices: number[]
}

const SEPARATOR_PATTERN = /[/\\._-]/

/**
 * Subsequence fuzzy match: every character in `query` must appear in `target`, in order,
 * but not necessarily contiguously. Score rewards consecutive runs and matches that start
 * right after a path/word separator (e.g. matching "fe" against "file-explorer" scores the
 * "f" and "e" starts highly), and slightly prefers shorter targets among equal-quality matches.
 */
export function fuzzyMatch(query: string, target: string): FuzzyMatchResult {
  if (query.length === 0) {
    return { matched: true, score: 0, indices: [] }
  }

  const q = query.toLowerCase()
  const t = target.toLowerCase()

  const indices: number[] = []
  let queryIndex = 0
  let score = 0
  let previousMatchIndex = -1

  for (let targetIndex = 0; targetIndex < t.length && queryIndex < q.length; targetIndex++) {
    if (t[targetIndex] !== q[queryIndex]) continue

    indices.push(targetIndex)

    score += previousMatchIndex === targetIndex - 1 ? 10 : 1

    const precedingChar = t[targetIndex - 1]
    if (targetIndex === 0 || (precedingChar !== undefined && SEPARATOR_PATTERN.test(precedingChar))) {
      score += 5
    }

    previousMatchIndex = targetIndex
    queryIndex += 1
  }

  const matched = queryIndex === q.length
  if (!matched) {
    return { matched: false, score: 0, indices: [] }
  }

  const lengthPenalty = t.length * 0.01
  return { matched: true, score: score - lengthPenalty, indices }
}

export function fuzzyFilter<T>(query: string, items: T[], getLabel: (item: T) => string): T[] {
  if (!query) return items

  return items
    .map((item) => ({ item, result: fuzzyMatch(query, getLabel(item)) }))
    .filter(({ result }) => result.matched)
    .sort((a, b) => b.result.score - a.result.score)
    .map(({ item }) => item)
}
