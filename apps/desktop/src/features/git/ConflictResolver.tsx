import { useEffect, useState } from 'react'
import { useAppStore } from '../../store'
import { Button } from '../../components/ui/Button'
import { type ConflictSegment, joinSegments, parseConflictMarkers } from '../../lib/conflict-parser'

export interface ConflictResolverProps {
  path: string
}

type Choice = 'ours' | 'theirs' | 'both'

/** `phase-12-git-integration.md`'s "basic conflict resolution UI" — reads the working-tree file
 *  (which already contains git's own `<<<<<<< / ======= / >>>>>>>` markers; conflict resolution
 *  doesn't need a separate 3-way-merge fetch since git already wrote both sides into the file),
 *  lets the user pick a side per block, then writes the resolved content back and stages it —
 *  the same "mark resolved" step `git add` performs for a conflicted path. */
export function ConflictResolver({ path }: ConflictResolverProps): JSX.Element {
  const stageFiles = useAppStore((state) => state.stageFiles)
  const [segments, setSegments] = useState<ConflictSegment[] | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSegments(null)
    void window.rasik.files.read(path).then((result) => {
      if (cancelled) return
      setSegments(parseConflictMarkers(result.ok ? result.data : ''))
    })
    return () => {
      cancelled = true
    }
  }, [path])

  if (!segments) {
    return <div className="p-3 text-xs text-text-secondary">Loading…</div>
  }

  const resolveBlock = (index: number, choice: Choice): void => {
    setSegments((current) => {
      if (!current) return current
      const segment = current[index]
      if (!segment || segment.type !== 'conflict') return current
      const content =
        choice === 'ours'
          ? segment.ours
          : choice === 'theirs'
            ? segment.theirs
            : [segment.ours, segment.theirs].filter(Boolean).join('\n')
      const next = [...current]
      next[index] = { type: 'text', content }
      return next
    })
  }

  const remaining = segments.filter((segment) => segment.type === 'conflict').length

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const writeResult = await window.rasik.files.write(path, joinSegments(segments))
      if (writeResult.ok) await stageFiles([path])
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-1.5">
        <span className="truncate text-xs text-text-secondary">
          {path} — {remaining} conflict{remaining === 1 ? '' : 's'} remaining
        </span>
        <Button variant="primary" size="sm" disabled={remaining > 0 || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save & Stage'}
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-3 font-mono text-xs">
        {segments.map((segment, index) =>
          segment.type === 'text' ? (
            <pre key={index} className="whitespace-pre-wrap text-text-primary">
              {segment.content}
            </pre>
          ) : (
            <div key={index} className="my-2 rounded border border-status-warning">
              <div className="flex flex-wrap items-center justify-between gap-1 bg-bg-elevated px-2 py-1">
                <span className="text-status-warning">Conflict</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => resolveBlock(index, 'ours')}>
                    Accept Current ({segment.oursLabel})
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => resolveBlock(index, 'theirs')}>
                    Accept Incoming ({segment.theirsLabel})
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => resolveBlock(index, 'both')}>
                    Accept Both
                  </Button>
                </div>
              </div>
              <pre className="whitespace-pre-wrap px-2 py-1 text-text-primary">{segment.ours || '(empty)'}</pre>
              <pre className="whitespace-pre-wrap border-t border-border-subtle px-2 py-1 text-text-primary">
                {segment.theirs || '(empty)'}
              </pre>
            </div>
          ),
        )}
      </div>
    </div>
  )
}
