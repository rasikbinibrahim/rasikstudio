import { useEffect, useRef, useState } from 'react'
import type * as Monaco from 'monaco-editor'
import { useMonaco, MONACO_DARK_THEME, MONACO_LIGHT_THEME } from '../editor/useMonaco'
import { languageForPath } from '../editor/language-config'
import { useAppStore } from '../../store'

/** `phase-12-git-integration.md`'s "Clicking a file in the diff panel opens Monaco diff editor
 *  with correct before/after" — a real side-by-side diff, not just rendering `git diff`'s
 *  unified-text output in a plain editor. "Before" is always the last-commit version
 *  (`git show HEAD:path`, empty string for a file that doesn't exist there yet — a new/untracked
 *  file correctly renders as fully added). "After" is the index/staged blob for a staged diff, or
 *  the live working-tree file (via the existing `files:read` IPC, not git at all) for an unstaged
 *  one. */
export function DiffViewer(): JSX.Element | null {
  const monaco = useMonaco()
  const containerRef = useRef<HTMLDivElement>(null)
  const diffEditorRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(null)
  const modelsRef = useRef<{ original: Monaco.editor.ITextModel; modified: Monaco.editor.ITextModel } | null>(
    null,
  )
  const diffTarget = useAppStore((state) => state.gitDiffTarget)
  const closeDiff = useAppStore((state) => state.closeDiff)
  const theme = useAppStore((state) => state.theme)
  const [loading, setLoading] = useState(false)

  // Create the diff editor once, when Monaco is ready — same lifecycle as MonacoEditor.tsx.
  useEffect(() => {
    if (!monaco || !containerRef.current || diffEditorRef.current) return

    diffEditorRef.current = monaco.editor.createDiffEditor(containerRef.current, {
      theme: theme === 'light' ? MONACO_LIGHT_THEME : MONACO_DARK_THEME,
      readOnly: true,
      automaticLayout: true,
      renderSideBySide: true,
    })

    return () => {
      diffEditorRef.current?.dispose()
      diffEditorRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monaco])

  useEffect(() => {
    if (!monaco) return
    monaco.editor.setTheme(theme === 'light' ? MONACO_LIGHT_THEME : MONACO_DARK_THEME)
  }, [monaco, theme])

  useEffect(() => {
    if (!monaco || !diffEditorRef.current || !diffTarget) return
    let cancelled = false
    setLoading(true)

    void (async () => {
      const [originalResult, modifiedResult] = await Promise.all([
        window.rasik.git.showFile('HEAD', diffTarget.path),
        diffTarget.staged
          ? window.rasik.git.showFile('', diffTarget.path)
          : window.rasik.files.read(diffTarget.path),
      ])
      if (cancelled) return

      const original = originalResult.ok ? originalResult.data : ''
      const modified = modifiedResult.ok ? modifiedResult.data : ''
      const language = languageForPath(diffTarget.path)

      const previousModels = modelsRef.current
      const originalModel = monaco.editor.createModel(original, language)
      const modifiedModel = monaco.editor.createModel(modified, language)
      modelsRef.current = { original: originalModel, modified: modifiedModel }
      diffEditorRef.current?.setModel({ original: originalModel, modified: modifiedModel })
      previousModels?.original.dispose()
      previousModels?.modified.dispose()

      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [monaco, diffTarget])

  // Dispose the last pair of models on unmount — the effect above only disposes the *previous*
  // pair when a *new* one is set, so the final pair needs its own cleanup.
  useEffect(() => {
    return () => {
      modelsRef.current?.original.dispose()
      modelsRef.current?.modified.dispose()
      modelsRef.current = null
    }
  }, [])

  if (!diffTarget) return null

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-1.5">
        <span className="truncate text-xs text-text-secondary">
          {diffTarget.path} {diffTarget.staged ? '(staged)' : '(working tree)'}
        </span>
        <button
          type="button"
          onClick={closeDiff}
          className="text-xs text-text-secondary hover:text-text-primary"
        >
          Close
        </button>
      </div>
      <div className="relative flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-base text-xs text-text-secondary">
            Loading diff…
          </div>
        )}
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  )
}
