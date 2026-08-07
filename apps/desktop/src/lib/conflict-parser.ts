export interface ConflictTextSegment {
  type: 'text'
  content: string
}

export interface ConflictBlockSegment {
  type: 'conflict'
  oursLabel: string
  ours: string
  theirsLabel: string
  theirs: string
}

export type ConflictSegment = ConflictTextSegment | ConflictBlockSegment

const START = '<<<<<<<'
const MID = '======='
const END = '>>>>>>>'

/** Splits a file's content into plain-text runs and conflict blocks around git's standard
 *  `<<<<<<< / ======= / >>>>>>>` markers. Line-based, matching how git itself writes conflict
 *  markers (always full lines, never mid-line) — a block missing its closing `>>>>>>>` (a
 *  malformed/truncated file) is treated as plain text rather than silently swallowing the rest of
 *  the file, since guessing wrong here would mean writing back truncated content. */
export function parseConflictMarkers(content: string): ConflictSegment[] {
  const lines = content.split('\n')
  const segments: ConflictSegment[] = []
  let textBuffer: string[] = []
  let i = 0

  const flushText = (): void => {
    if (textBuffer.length > 0) {
      segments.push({ type: 'text', content: textBuffer.join('\n') })
      textBuffer = []
    }
  }

  while (i < lines.length) {
    const line = lines[i] ?? ''

    if (line.startsWith(START)) {
      const midIndex = lines.findIndex((l, idx) => idx > i && l.startsWith(MID))
      const endIndex = midIndex >= 0 ? lines.findIndex((l, idx) => idx > midIndex && l.startsWith(END)) : -1

      if (midIndex >= 0 && endIndex >= 0) {
        flushText()
        segments.push({
          type: 'conflict',
          oursLabel: line.slice(START.length).trim() || 'ours',
          ours: lines.slice(i + 1, midIndex).join('\n'),
          theirsLabel: (lines[endIndex] ?? '').slice(END.length).trim() || 'theirs',
          theirs: lines.slice(midIndex + 1, endIndex).join('\n'),
        })
        i = endIndex + 1
        continue
      }
    }

    textBuffer.push(line)
    i += 1
  }

  flushText()
  return segments
}

export function hasConflictMarkers(content: string): boolean {
  return parseConflictMarkers(content).some((segment) => segment.type === 'conflict')
}

/** Renders resolved segments back into plain file content — each conflict segment must already
 *  have been replaced with a plain `{ type: 'text' }` segment (the caller's job) before this is
 *  called; a `ConflictResolver.tsx` "Save" action isn't valid until every block is resolved. */
export function joinSegments(segments: ConflictSegment[]): string {
  return segments
    .map((segment) => (segment.type === 'text' ? segment.content : ''))
    .join('\n')
}
