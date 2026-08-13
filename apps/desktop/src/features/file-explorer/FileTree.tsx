import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useFileTree } from './useFileTree'
import { FileTreeNode } from './FileTreeNode'

/** Virtualized (Phase 18's real measurement: 1000 real files took 1265ms to render unvirtualized
 *  against a 50ms NFR target — see `PERFORMANCE_GUIDE.md` §1a). `useFileTree`'s `visibleEntries`
 *  is already the flattened, tree-ordered row list; this component's only job is turning that
 *  into a virtualized scroll region, the same `@tanstack/react-virtual` pattern
 *  `ChatMessageList.tsx` already established. `FileTreeNode` renders exactly one row — it no
 *  longer recurses into its own expanded children, since the flat list already includes them at
 *  the right depth. */
export function FileTree(): JSX.Element {
  const tree = useFileTree()
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: tree.visibleEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 22,
    overscan: 12,
  })

  return (
    <div ref={parentRef} className="flex-1 overflow-auto py-1">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const row = tree.visibleEntries[virtualItem.index]
          if (!row) return null
          return (
            <div
              key={row.entry.path}
              data-index={virtualItem.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <FileTreeNode entry={row.entry} depth={row.depth} tree={tree} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
