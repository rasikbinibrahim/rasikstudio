import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { DiffViewer } from './DiffViewer'
import { useAppStore } from '../../store'

// Real, unmocked `monaco-editor` — genuinely loadable under Vitest since `vitest.config.ts`'s
// `resolve.mainFields` gained `'module'` and `src/test/setup.ts` gained the jsdom stubs real
// Monaco needs (document.queryCommandSupported, a fake canvas 2D context, an unhandledRejection
// filter for Monaco's own diff-worker cancellation signal — see each file's own comments). This
// closes the exact gap named across multiple `TASKS.md`/`PROGRESS.md` entries: "DiffViewer.tsx's
// own content-loading effect has no dedicated automated test." `GitPanel.test.tsx` deliberately
// keeps mocking `useMonaco` to `() => null` — that's still the right, fast choice for testing
// status/staging/commit UI that doesn't care about the diff editor itself; this file is what
// exercises the diff-loading logic `GitPanel.test.tsx` explicitly couldn't reach.
const DIFF_TEST_TIMEOUT = 20_000

function stubGitApi(overrides: Record<string, unknown> = {}): {
  showFile: ReturnType<typeof vi.fn>
  read: ReturnType<typeof vi.fn>
} {
  const git = {
    showFile: vi.fn(async () => ({ ok: true, data: '' })),
    ...overrides,
  }
  const files = {
    read: vi.fn(async () => ({ ok: true, data: '' })),
  }
  ;(window as unknown as { rasik: { git: object; files: object } }).rasik = {
    ...(window as unknown as { rasik?: object }).rasik,
    git,
    files,
  }
  return { showFile: git.showFile, read: files.read }
}

let pathCounter = 0

/** A unique path per call — Monaco's model registry is real and global for the whole test file;
 *  reusing the same path/content across tests risks matching a stale, never-explicitly-closed
 *  model from an earlier test instead of this test's own (see the identical note in
 *  `MonacoEditor.test.tsx`, which hit this for real before the fix). */
function uniquePath(): string {
  pathCounter += 1
  return `src/diff-${pathCounter}.txt`
}

describe('DiffViewer', () => {
  beforeEach(() => {
    useAppStore.setState({ gitDiffTarget: null, theme: 'dark' })
  })

  it('renders nothing when no diff target is set', () => {
    stubGitApi()
    const { container } = render(<DiffViewer />)

    expect(container.firstChild).toBeNull()
  })

  it(
    'loads HEAD as "before" and the live working-tree file as "after" for an unstaged diff',
    async () => {
      const path = uniquePath()
      const { showFile, read } = stubGitApi({
        showFile: vi.fn(async () => ({ ok: true, data: 'original content' })),
      })
      read.mockResolvedValue({ ok: true, data: 'modified content' })
      useAppStore.setState({ gitDiffTarget: { path, staged: false } })

      const { container } = render(<DiffViewer />)

      await waitFor(
        () => expect(container.querySelector('.monaco-diff-editor')).not.toBeNull(),
        { timeout: DIFF_TEST_TIMEOUT },
      )
      await waitFor(() => {
        expect(showFile).toHaveBeenCalledWith('HEAD', path)
        expect(read).toHaveBeenCalledWith(path)
      })

      const monaco = await import('monaco-editor')
      await waitFor(() => {
        const model = monaco.editor.getModels().find((m) => m.getValue() === 'modified content')
        expect(model).toBeDefined()
      })
    },
    DIFF_TEST_TIMEOUT,
  )

  it(
    'loads the index blob as "after" for a staged diff, via git show, not files.read',
    async () => {
      const path = uniquePath()
      const { showFile, read } = stubGitApi({
        showFile: vi.fn(async (ref: string) =>
          ref === 'HEAD' ? { ok: true, data: 'before' } : { ok: true, data: 'staged after' },
        ),
      })
      useAppStore.setState({ gitDiffTarget: { path, staged: true } })

      const { container } = render(<DiffViewer />)

      await waitFor(
        () => expect(container.querySelector('.monaco-diff-editor')).not.toBeNull(),
        { timeout: DIFF_TEST_TIMEOUT },
      )
      await waitFor(() => expect(showFile).toHaveBeenCalledWith('', path))
      expect(read).not.toHaveBeenCalled()

      const monaco = await import('monaco-editor')
      await waitFor(() => {
        const model = monaco.editor.getModels().find((m) => m.getValue() === 'staged after')
        expect(model).toBeDefined()
      })
    },
    DIFF_TEST_TIMEOUT,
  )

  it(
    'a new file (no HEAD version) renders an empty "before" instead of erroring',
    async () => {
      const path = uniquePath()
      stubGitApi({ showFile: vi.fn(async () => ({ ok: false, error: 'path not found in HEAD' })) })
      useAppStore.setState({ gitDiffTarget: { path, staged: false } })

      const { container } = render(<DiffViewer />)

      await waitFor(
        () => expect(container.querySelector('.monaco-diff-editor')).not.toBeNull(),
        { timeout: DIFF_TEST_TIMEOUT },
      )

      const monaco = await import('monaco-editor')
      await waitFor(() => {
        const model = monaco.editor.getModels().find((m) => m.getValue() === '')
        expect(model).toBeDefined()
      })
    },
    DIFF_TEST_TIMEOUT,
  )

  it(
    'closing the diff calls closeDiff',
    async () => {
      const path = uniquePath()
      stubGitApi()
      const closeDiff = vi.fn()
      useAppStore.setState({ gitDiffTarget: { path, staged: false }, closeDiff })

      const { findByText } = render(<DiffViewer />)
      const closeButton = await findByText('Close')
      closeButton.click()

      expect(closeDiff).toHaveBeenCalledOnce()
    },
    DIFF_TEST_TIMEOUT,
  )
})
