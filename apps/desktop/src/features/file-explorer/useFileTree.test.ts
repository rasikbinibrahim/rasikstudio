import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useAppStore } from '../../store'
import { useFileTree } from './useFileTree'
import type { FileTreeEntry } from '../../types/workspace'

function rootEntry(overrides: Partial<FileTreeEntry> = {}): FileTreeEntry {
  return { name: 'src', path: 'src', isDirectory: true, ...overrides }
}

function stubFilesList(impl: (dirPath: string) => Promise<{ ok: true; data: FileTreeEntry[] } | { ok: false; error: string }>): void {
  ;(window as unknown as { rasik: { files: object } }).rasik = {
    ...(window as unknown as { rasik?: object }).rasik,
    files: { list: vi.fn(impl) },
  }
}

describe('useFileTree', () => {
  beforeEach(() => {
    useAppStore.setState({ workspaceRoot: null, refreshAllFiles: vi.fn(async () => undefined) })
  })

  it('loads the root directory once a workspace is open', async () => {
    stubFilesList(async (dirPath) => (dirPath === '' ? { ok: true as const, data: [rootEntry()] } : { ok: true as const, data: [] }))
    useAppStore.setState({ workspaceRoot: '/ws' })

    const { result } = renderHook(() => useFileTree())

    await waitFor(() => expect(result.current.rootEntries).toEqual([rootEntry()]))
  })

  it('starts empty when no workspace is open', () => {
    const { result } = renderHook(() => useFileTree())
    expect(result.current.rootEntries).toEqual([])
  })

  it('resets and reloads when the workspace root changes', async () => {
    const list = vi.fn(async (dirPath: string) =>
      dirPath === '' ? { ok: true as const, data: [rootEntry({ name: 'ws1-root' })] } : { ok: true as const, data: [] },
    )
    stubFilesList(list)
    useAppStore.setState({ workspaceRoot: '/ws1' })
    const { result, rerender } = renderHook(() => useFileTree())
    await waitFor(() => expect(result.current.rootEntries).toEqual([rootEntry({ name: 'ws1-root' })]))

    list.mockImplementation(async (dirPath: string) =>
      dirPath === '' ? { ok: true as const, data: [rootEntry({ name: 'ws2-root' })] } : { ok: true as const, data: [] },
    )
    useAppStore.setState({ workspaceRoot: '/ws2' })
    rerender()

    await waitFor(() => expect(result.current.rootEntries).toEqual([rootEntry({ name: 'ws2-root' })]))
  })

  it('clears rootEntries when the workspace closes', async () => {
    stubFilesList(async () => ({ ok: true as const, data: [rootEntry()] }))
    useAppStore.setState({ workspaceRoot: '/ws' })
    const { result, rerender } = renderHook(() => useFileTree())
    await waitFor(() => expect(result.current.rootEntries).toEqual([rootEntry()]))

    useAppStore.setState({ workspaceRoot: null })
    rerender()

    expect(result.current.rootEntries).toEqual([])
  })

  it('toggleExpand expands a directory and lazily loads its children on first open', async () => {
    stubFilesList(async (dirPath) =>
      dirPath === ''
        ? { ok: true as const, data: [rootEntry()] }
        : { ok: true as const, data: [{ name: 'index.ts', path: 'src/index.ts', isDirectory: false }] },
    )
    useAppStore.setState({ workspaceRoot: '/ws' })
    const { result } = renderHook(() => useFileTree())
    await waitFor(() => expect(result.current.rootEntries).toEqual([rootEntry()]))

    act(() => result.current.toggleExpand('src'))

    expect(result.current.expandedPaths.has('src')).toBe(true)
    await waitFor(() =>
      expect(result.current.childrenByPath['src']).toEqual([{ name: 'index.ts', path: 'src/index.ts', isDirectory: false }]),
    )
  })

  it('toggleExpand collapses an already-expanded directory without re-fetching', async () => {
    const list = vi.fn(async (dirPath: string) =>
      dirPath === '' ? { ok: true as const, data: [rootEntry()] } : { ok: true as const, data: [] },
    )
    stubFilesList(list)
    useAppStore.setState({ workspaceRoot: '/ws' })
    const { result } = renderHook(() => useFileTree())
    await waitFor(() => expect(result.current.rootEntries).toEqual([rootEntry()]))

    act(() => result.current.toggleExpand('src'))
    await waitFor(() => expect(result.current.expandedPaths.has('src')).toBe(true))
    const callsAfterFirstExpand = list.mock.calls.length

    act(() => result.current.toggleExpand('src'))

    expect(result.current.expandedPaths.has('src')).toBe(false)
    expect(list).toHaveBeenCalledTimes(callsAfterFirstExpand)
  })

  it('toggleExpand does not re-fetch children already loaded from a prior expand', async () => {
    const list = vi.fn(async (dirPath: string) =>
      dirPath === '' ? { ok: true as const, data: [rootEntry()] } : { ok: true as const, data: [] },
    )
    stubFilesList(list)
    useAppStore.setState({ workspaceRoot: '/ws' })
    const { result } = renderHook(() => useFileTree())
    await waitFor(() => expect(result.current.rootEntries).toEqual([rootEntry()]))

    act(() => result.current.toggleExpand('src'))
    await waitFor(() => expect(result.current.expandedPaths.has('src')).toBe(true))
    act(() => result.current.toggleExpand('src'))
    const callsAfterCollapse = list.mock.calls.length

    act(() => result.current.toggleExpand('src'))

    expect(result.current.expandedPaths.has('src')).toBe(true)
    expect(list).toHaveBeenCalledTimes(callsAfterCollapse)
  })

  it('visibleEntries is just the flat root list when nothing is expanded', async () => {
    const entries = [rootEntry({ name: 'a' }), rootEntry({ name: 'b', isDirectory: false })]
    stubFilesList(async (dirPath) => (dirPath === '' ? { ok: true as const, data: entries } : { ok: true as const, data: [] }))
    useAppStore.setState({ workspaceRoot: '/ws' })
    const { result } = renderHook(() => useFileTree())

    await waitFor(() =>
      expect(result.current.visibleEntries).toEqual([
        { entry: entries[0], depth: 0 },
        { entry: entries[1], depth: 0 },
      ]),
    )
  })

  it('visibleEntries inserts an expanded directory’s children right after it, at depth + 1', async () => {
    const child = { name: 'index.ts', path: 'src/index.ts', isDirectory: false }
    stubFilesList(async (dirPath) =>
      dirPath === '' ? { ok: true as const, data: [rootEntry()] } : { ok: true as const, data: [child] },
    )
    useAppStore.setState({ workspaceRoot: '/ws' })
    const { result } = renderHook(() => useFileTree())
    await waitFor(() => expect(result.current.rootEntries).toEqual([rootEntry()]))

    act(() => result.current.toggleExpand('src'))

    await waitFor(() =>
      expect(result.current.visibleEntries).toEqual([
        { entry: rootEntry(), depth: 0 },
        { entry: child, depth: 1 },
      ]),
    )
  })

  it('visibleEntries omits a collapsed directory’s children even if already loaded from a prior expand', async () => {
    const child = { name: 'index.ts', path: 'src/index.ts', isDirectory: false }
    stubFilesList(async (dirPath) =>
      dirPath === '' ? { ok: true as const, data: [rootEntry()] } : { ok: true as const, data: [child] },
    )
    useAppStore.setState({ workspaceRoot: '/ws' })
    const { result } = renderHook(() => useFileTree())
    await waitFor(() => expect(result.current.rootEntries).toEqual([rootEntry()]))
    act(() => result.current.toggleExpand('src'))
    await waitFor(() => expect(result.current.visibleEntries).toHaveLength(2))

    act(() => result.current.toggleExpand('src')) // collapse again

    expect(result.current.visibleEntries).toEqual([{ entry: rootEntry(), depth: 0 }])
  })

  it('visibleEntries flattens nested expanded directories in real depth-first tree order', async () => {
    const nested = { name: 'nested', path: 'src/nested', isDirectory: true }
    const leaf = { name: 'leaf.ts', path: 'src/nested/leaf.ts', isDirectory: false }
    stubFilesList(async (dirPath) => {
      if (dirPath === '') return { ok: true as const, data: [rootEntry()] }
      if (dirPath === 'src') return { ok: true as const, data: [nested] }
      if (dirPath === 'src/nested') return { ok: true as const, data: [leaf] }
      return { ok: true as const, data: [] }
    })
    useAppStore.setState({ workspaceRoot: '/ws' })
    const { result } = renderHook(() => useFileTree())
    await waitFor(() => expect(result.current.rootEntries).toEqual([rootEntry()]))

    act(() => result.current.toggleExpand('src'))
    await waitFor(() => expect(result.current.childrenByPath['src']).toEqual([nested]))
    act(() => result.current.toggleExpand('src/nested'))

    await waitFor(() =>
      expect(result.current.visibleEntries).toEqual([
        { entry: rootEntry(), depth: 0 },
        { entry: nested, depth: 1 },
        { entry: leaf, depth: 2 },
      ]),
    )
  })

  it('refreshParentOf reloads the parent directory and the full quick-open file list', async () => {
    const list = vi.fn(async (): Promise<{ ok: true; data: FileTreeEntry[] }> => ({ ok: true, data: [] }))
    stubFilesList(list)
    const refreshAllFiles = vi.fn(async () => undefined)
    useAppStore.setState({ workspaceRoot: '/ws', refreshAllFiles })
    const { result } = renderHook(() => useFileTree())
    await waitFor(() => expect(list).toHaveBeenCalled())
    list.mockClear()

    act(() => result.current.refreshParentOf('src/App.tsx'))

    await waitFor(() => expect(list).toHaveBeenCalledWith('src'))
    expect(refreshAllFiles).toHaveBeenCalledOnce()
  })
})
