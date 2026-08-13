import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './index'

function stubFilesApi(overrides: Record<string, unknown> = {}): void {
  ;(window as unknown as { rasik: { files: object } }).rasik = {
    ...(window as unknown as { rasik?: object }).rasik,
    files: {
      read: vi.fn(async () => ({ ok: true, data: 'file contents' })),
      write: vi.fn(async () => ({ ok: true, data: null })),
      ...overrides,
    },
  }
}

describe('editor-slice', () => {
  beforeEach(() => {
    stubFilesApi()
    useAppStore.setState({ openFiles: [], activeFileId: null, cursorPosition: null })
  })

  it('openFile reads the file and opens it as a new tab', async () => {
    await useAppStore.getState().openFile('src/App.tsx')

    expect(useAppStore.getState().openFiles).toEqual([
      { id: 'src/App.tsx', path: 'src/App.tsx', name: 'App.tsx', content: 'file contents', isDirty: false },
    ])
    expect(useAppStore.getState().activeFileId).toBe('src/App.tsx')
  })

  it('openFile switches to the existing tab instead of reopening an already-open file', async () => {
    const read = vi.fn(async () => ({ ok: true, data: 'file contents' }))
    stubFilesApi({ read })
    await useAppStore.getState().openFile('src/App.tsx')
    await useAppStore.getState().openFile('src/Other.tsx')

    await useAppStore.getState().openFile('src/App.tsx')

    expect(read).toHaveBeenCalledTimes(2)
    expect(useAppStore.getState().activeFileId).toBe('src/App.tsx')
  })

  it('openFile does nothing when the read fails', async () => {
    stubFilesApi({ read: vi.fn(async () => ({ ok: false, error: 'ENOENT' })) })

    await useAppStore.getState().openFile('src/Missing.tsx')

    expect(useAppStore.getState().openFiles).toEqual([])
  })

  it('closeFile removes the tab and activates the next one', () => {
    useAppStore.setState({
      openFiles: [
        { id: 'a', path: 'a.ts', name: 'a.ts', content: '', isDirty: false },
        { id: 'b', path: 'b.ts', name: 'b.ts', content: '', isDirty: false },
      ],
      activeFileId: 'a',
    })

    useAppStore.getState().closeFile('a')

    expect(useAppStore.getState().openFiles.map((f) => f.id)).toEqual(['b'])
    expect(useAppStore.getState().activeFileId).toBe('b')
  })

  it('closeFile activates the previous tab when the last tab is closed', () => {
    useAppStore.setState({
      openFiles: [
        { id: 'a', path: 'a.ts', name: 'a.ts', content: '', isDirty: false },
        { id: 'b', path: 'b.ts', name: 'b.ts', content: '', isDirty: false },
      ],
      activeFileId: 'b',
    })

    useAppStore.getState().closeFile('b')

    expect(useAppStore.getState().activeFileId).toBe('a')
  })

  it('closeFile sets activeFileId to null when the only tab is closed', () => {
    useAppStore.setState({
      openFiles: [{ id: 'a', path: 'a.ts', name: 'a.ts', content: '', isDirty: false }],
      activeFileId: 'a',
    })

    useAppStore.getState().closeFile('a')

    expect(useAppStore.getState().activeFileId).toBeNull()
    expect(useAppStore.getState().openFiles).toEqual([])
  })

  it('closeFile leaves activeFileId untouched when closing a non-active tab', () => {
    useAppStore.setState({
      openFiles: [
        { id: 'a', path: 'a.ts', name: 'a.ts', content: '', isDirty: false },
        { id: 'b', path: 'b.ts', name: 'b.ts', content: '', isDirty: false },
      ],
      activeFileId: 'a',
    })

    useAppStore.getState().closeFile('b')

    expect(useAppStore.getState().activeFileId).toBe('a')
  })

  it('closeFileByPath closes the tab matching that path', () => {
    useAppStore.setState({
      openFiles: [{ id: 'a', path: 'src/a.ts', name: 'a.ts', content: '', isDirty: false }],
      activeFileId: 'a',
    })

    useAppStore.getState().closeFileByPath('src/a.ts')

    expect(useAppStore.getState().openFiles).toEqual([])
  })

  it('closeFileByPath does nothing when no tab matches that path', () => {
    useAppStore.setState({
      openFiles: [{ id: 'a', path: 'src/a.ts', name: 'a.ts', content: '', isDirty: false }],
    })

    useAppStore.getState().closeFileByPath('src/nonexistent.ts')

    expect(useAppStore.getState().openFiles).toHaveLength(1)
  })

  it('setActiveFile switches the active tab and clears cursor position', () => {
    useAppStore.setState({ cursorPosition: { line: 5, column: 1 } })

    useAppStore.getState().setActiveFile('b')

    expect(useAppStore.getState().activeFileId).toBe('b')
    expect(useAppStore.getState().cursorPosition).toBeNull()
  })

  it('updateContent updates content and marks the file dirty', () => {
    useAppStore.setState({
      openFiles: [{ id: 'a', path: 'a.ts', name: 'a.ts', content: 'old', isDirty: false }],
    })

    useAppStore.getState().updateContent('a', 'new content')

    expect(useAppStore.getState().openFiles[0]).toEqual({
      id: 'a',
      path: 'a.ts',
      name: 'a.ts',
      content: 'new content',
      isDirty: true,
    })
  })

  it('saveFile writes the file and clears the dirty flag', async () => {
    const write = vi.fn(async () => ({ ok: true, data: null }))
    stubFilesApi({ write })
    useAppStore.setState({
      openFiles: [{ id: 'a', path: 'a.ts', name: 'a.ts', content: 'content', isDirty: true }],
    })

    await useAppStore.getState().saveFile('a')

    expect(write).toHaveBeenCalledWith('a.ts', 'content')
    expect(useAppStore.getState().openFiles[0]?.isDirty).toBe(false)
  })

  it('saveFile leaves the dirty flag set when the write fails', async () => {
    stubFilesApi({ write: vi.fn(async () => ({ ok: false, error: 'EACCES' })) })
    useAppStore.setState({
      openFiles: [{ id: 'a', path: 'a.ts', name: 'a.ts', content: 'content', isDirty: true }],
    })

    await useAppStore.getState().saveFile('a')

    expect(useAppStore.getState().openFiles[0]?.isDirty).toBe(true)
  })

  it('saveFile does nothing for an id that is not open', async () => {
    const write = vi.fn(async () => ({ ok: true, data: null }))
    stubFilesApi({ write })

    await useAppStore.getState().saveFile('does-not-exist')

    expect(write).not.toHaveBeenCalled()
  })

  it('setCursorPosition updates the cursor position', () => {
    useAppStore.getState().setCursorPosition({ line: 10, column: 4 })
    expect(useAppStore.getState().cursorPosition).toEqual({ line: 10, column: 4 })
  })

  it('renameOpenFile updates the path and name but keeps the id stable', () => {
    useAppStore.setState({
      openFiles: [{ id: 'src/App.tsx', path: 'src/App.tsx', name: 'App.tsx', content: '', isDirty: false }],
    })

    useAppStore.getState().renameOpenFile('src/App.tsx', 'src/Renamed.tsx')

    expect(useAppStore.getState().openFiles[0]).toMatchObject({
      id: 'src/App.tsx',
      path: 'src/Renamed.tsx',
      name: 'Renamed.tsx',
    })
  })

  it('renameOpenFile does nothing when no tab matches the old path', () => {
    useAppStore.setState({
      openFiles: [{ id: 'a', path: 'a.ts', name: 'a.ts', content: '', isDirty: false }],
    })

    useAppStore.getState().renameOpenFile('nonexistent.ts', 'new.ts')

    expect(useAppStore.getState().openFiles[0]?.path).toBe('a.ts')
  })
})
