import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { FileTree } from './FileTree'
import { useAppStore } from '../../store'
import type { FileTreeEntry } from '../../types/workspace'

function stubFilesList(entries: FileTreeEntry[]): void {
  ;(window as unknown as { rasik: { files: object } }).rasik = {
    ...(window as unknown as { rasik?: object }).rasik,
    files: {
      list: vi.fn(async (dirPath: string) => (dirPath === '' ? { ok: true, data: entries } : { ok: true, data: [] })),
    },
  }
}

function fileEntry(overrides: Partial<FileTreeEntry> = {}): FileTreeEntry {
  return { name: 'file.ts', path: 'file.ts', isDirectory: false, ...overrides }
}

describe('FileTree', () => {
  beforeEach(() => {
    useAppStore.setState({ workspaceRoot: '/ws', refreshAllFiles: vi.fn(async () => undefined) })
  })

  // `@tanstack/react-virtual` decides which rows are actually rendered from the scroll
  // container's real layout (`getBoundingClientRect`), which jsdom doesn't provide — the same
  // gap `ChatMessageList.test.tsx` already documented for the identical pattern. What's real and
  // verifiable here without a real layout engine: the virtualizer received the right row count
  // (`useFileTree`'s `visibleEntries`, covered directly and thoroughly in `useFileTree.test.ts`)
  // and sized the scrollable region accordingly — proving `FileTree.tsx` is wired to the real
  // flattened list, not a stale or wrong one.
  it('sizes the virtualized scroll area for every visible entry', async () => {
    const entries = [fileEntry({ name: 'a.ts', path: 'a.ts' }), fileEntry({ name: 'b.ts', path: 'b.ts' })]
    stubFilesList(entries)

    const { container } = render(<FileTree />)

    await waitFor(() => {
      const sizer = container.querySelector('[style*="height"]')
      expect(sizer).toHaveStyle({ height: '44px' }) // 2 rows × the 22px row estimate
    })
  })

  it('grows the virtualized scroll area as more root entries load', async () => {
    stubFilesList(Array.from({ length: 100 }, (_, i) => fileEntry({ name: `f${i}.ts`, path: `f${i}.ts` })))

    const { container } = render(<FileTree />)

    await waitFor(() => {
      const sizer = container.querySelector('[style*="height"]')
      expect(sizer).toHaveStyle({ height: '2200px' }) // 100 rows × 22px
    })
  })
})
