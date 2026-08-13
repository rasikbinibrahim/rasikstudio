import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MonacoEditor } from './MonacoEditor'
import { useAppStore } from '../../store'
import type { OpenFile } from '../../types/workspace'

// Real, unmocked `monaco-editor` — genuinely loadable under Vitest since `vitest.config.ts`'s
// `resolve.mainFields` gained `'module'` and `src/test/setup.ts` gained a `document.
// queryCommandSupported` stub, a minimal fake canvas 2D context, and an `unhandledRejection`
// filter for Monaco's own internal diff-worker cancellation signal (see each file's own comments
// for exactly why). This is the fix TASKS.md named as "worth fixing once, not per-component" —
// `DiffViewer.tsx`'s own tests benefit from the same fix, no per-file rework needed.
//
// Every file used here is `.txt` (plaintext), not `.ts` — a real, deliberate choice: Monaco's
// *TypeScript* language mode lazily loads a separate worker-based language-service module via its
// own AMD-style resolution, which doesn't work under this environment and isn't what this
// component's own logic (model create/swap/dispose, content sync, view state) actually exercises.
// Plaintext has no such worker, so it tests the same real wiring without that unrelated, deeper
// TS-tooling integration gap. A real editor mount is genuinely slow (Monaco's real ~250K-line
// module graph transforms once per test file, then loads from cache) — every test uses a
// generous timeout for that reason.
const MONACO_TEST_TIMEOUT = 20_000

function stubLspApi(): void {
  ;(window as unknown as { rasik: { lsp: unknown } }).rasik = {
    ...(window as unknown as { rasik?: object }).rasik,
    lsp: {
      start: vi.fn(async () => ({ ok: true, data: null })),
      request: vi.fn(async () => ({ ok: true, data: null })),
      notify: vi.fn(),
      stop: vi.fn(async () => ({ ok: true, data: null })),
      onNotification: vi.fn(() => () => undefined),
    },
  }
}

let fileCounter = 0

/** A unique path per call — Monaco's model registry is a real, global, per-URI singleton shared
 *  across every test in this file (the same `monaco-editor` module instance stays loaded once
 *  imported), and `MonacoEditor.tsx` only disposes a file's model when it's explicitly removed
 *  from `openFiles`, not on component unmount — so reusing a path across tests would collide with
 *  a still-registered model from an earlier test. */
function openFile(overrides: Partial<OpenFile> = {}): OpenFile {
  fileCounter += 1
  return {
    id: `f${fileCounter}`,
    path: `src/file-${fileCounter}.txt`,
    name: `file-${fileCounter}.txt`,
    // Unique per call, not a fixed default — `monaco.editor.getModels()` is a real, global
    // registry shared across every test in this file (models from earlier tests that were never
    // explicitly closed stay registered), so a repeated content string would make `.find(m =>
    // m.getValue() === file.content)` ambiguous between this test's own model and a stale one.
    content: `hello world ${fileCounter}`,
    isDirty: false,
    ...overrides,
  }
}

describe('MonacoEditor', () => {
  beforeEach(() => {
    stubLspApi()
    useAppStore.setState({
      openFiles: [],
      activeFileId: null,
      workspaceRoot: '/ws',
      theme: 'dark',
      editorFontSize: 13,
      editorWordWrap: false,
    })
  })

  it(
    'shows the empty-state placeholder when no file is open',
    () => {
      render(<MonacoEditor />)

      expect(screen.getByText('No file open — select a file from the explorer')).toBeInTheDocument()
    },
    MONACO_TEST_TIMEOUT,
  )

  it(
    'mounts a real Monaco editor once a file is open, with the file content loaded',
    async () => {
      const file = openFile()
      useAppStore.setState({ openFiles: [file], activeFileId: file.id })

      const { container } = render(<MonacoEditor />)

      await waitFor(() => expect(container.querySelector('.monaco-editor')).not.toBeNull(), {
        timeout: MONACO_TEST_TIMEOUT,
      })
      expect(screen.queryByText('No file open — select a file from the explorer')).not.toBeInTheDocument()

      const monaco = await import('monaco-editor')
      await waitFor(() =>
        expect(monaco.editor.getModels().some((m) => m.getValue() === file.content)).toBe(true),
      )
    },
    MONACO_TEST_TIMEOUT,
  )

  it(
    'real content edits call updateContent with the active file id',
    async () => {
      const file = openFile()
      const updateContent = vi.fn()
      useAppStore.setState({ openFiles: [file], activeFileId: file.id, updateContent })

      const { container } = render(<MonacoEditor />)
      await waitFor(() => expect(container.querySelector('.monaco-editor')).not.toBeNull(), {
        timeout: MONACO_TEST_TIMEOUT,
      })

      const monaco = await import('monaco-editor')
      const model = await waitFor(() => {
        const found = monaco.editor.getModels().find((m) => m.getValue() === file.content)
        expect(found).toBeDefined()
        return found!
      })
      model.setValue('edited content')

      await waitFor(() => expect(updateContent).toHaveBeenCalledWith(file.id, 'edited content'))
    },
    MONACO_TEST_TIMEOUT,
  )

  it(
    'switching the active file swaps the editor model to the new file’s content',
    async () => {
      const fileA = openFile({ content: 'content a' })
      const fileB = openFile({ content: 'content b' })
      useAppStore.setState({ openFiles: [fileA, fileB], activeFileId: fileA.id })

      const { container } = render(<MonacoEditor />)
      await waitFor(() => expect(container.querySelector('.monaco-editor')).not.toBeNull(), {
        timeout: MONACO_TEST_TIMEOUT,
      })

      const monaco = await import('monaco-editor')
      await waitFor(() =>
        expect(monaco.editor.getModels().some((m) => m.getValue() === 'content a')).toBe(true),
      )

      useAppStore.setState({ activeFileId: fileB.id })

      await waitFor(() =>
        expect(monaco.editor.getModels().some((m) => m.getValue() === 'content b')).toBe(true),
      )
    },
    MONACO_TEST_TIMEOUT,
  )

  it(
    'closing a file disposes its model',
    async () => {
      const file = openFile()
      useAppStore.setState({ openFiles: [file], activeFileId: file.id })

      const { container, rerender } = render(<MonacoEditor />)
      await waitFor(() => expect(container.querySelector('.monaco-editor')).not.toBeNull(), {
        timeout: MONACO_TEST_TIMEOUT,
      })

      const monaco = await import('monaco-editor')
      await waitFor(() => expect(monaco.editor.getModels().some((m) => m.getValue() === file.content)).toBe(true), {
        timeout: MONACO_TEST_TIMEOUT,
      })

      useAppStore.setState({ openFiles: [], activeFileId: null })
      rerender(<MonacoEditor />)

      await waitFor(
        () => expect(monaco.editor.getModels().some((m) => m.getValue() === file.content)).toBe(false),
        { timeout: MONACO_TEST_TIMEOUT },
      )
    },
    MONACO_TEST_TIMEOUT,
  )
})
