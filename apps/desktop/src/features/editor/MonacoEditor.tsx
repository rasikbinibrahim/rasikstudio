import { useEffect, useRef } from 'react'
import type * as Monaco from 'monaco-editor'
import { useMonaco, MONACO_DARK_THEME, MONACO_LIGHT_THEME } from './useMonaco'
import { languageForPath } from './language-config'
import { lspClient } from './lsp-client'
import { useAppStore } from '../../store'
import '../../styles/editor.css'

export function MonacoEditor(): JSX.Element {
  const monaco = useMonaco()
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const modelsRef = useRef<Map<string, Monaco.editor.ITextModel>>(new Map())
  const viewStatesRef = useRef<Map<string, Monaco.editor.ICodeEditorViewState>>(new Map())
  const previousFileIdRef = useRef<string | null>(null)

  const openFiles = useAppStore((state) => state.openFiles)
  const activeFileId = useAppStore((state) => state.activeFileId)
  const updateContent = useAppStore((state) => state.updateContent)
  const saveFile = useAppStore((state) => state.saveFile)
  const setCursorPosition = useAppStore((state) => state.setCursorPosition)
  const theme = useAppStore((state) => state.theme)
  const editorFontSize = useAppStore((state) => state.editorFontSize)
  const editorWordWrap = useAppStore((state) => state.editorWordWrap)
  const workspaceRoot = useAppStore((state) => state.workspaceRoot)

  // Create the editor once, when Monaco is ready. Reused for the app's lifetime.
  useEffect(() => {
    if (!monaco || !containerRef.current || editorRef.current) return

    const editor = monaco.editor.create(containerRef.current, {
      theme: theme === 'light' ? MONACO_LIGHT_THEME : MONACO_DARK_THEME,
      automaticLayout: true,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
      fontSize: editorFontSize,
      wordWrap: editorWordWrap ? 'on' : 'off',
    })
    editorRef.current = editor

    lspClient.registerProviders(monaco)
    lspClient.listenForDiagnostics(monaco)

    editor.onDidChangeModelContent(() => {
      const id = useAppStore.getState().activeFileId
      if (id) updateContent(id, editor.getValue())
      const model = editor.getModel()
      if (model) lspClient.didChange(model)
    })

    editor.onDidChangeCursorPosition((event) => {
      setCursorPosition({ line: event.position.lineNumber, column: event.position.column })
    })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const id = useAppStore.getState().activeFileId
      if (id) void saveFile(id)
    })

    return () => {
      editor.dispose()
      editorRef.current = null
    }
    // theme is intentionally excluded — only the initial value applies to editor.create();
    // subsequent changes are handled by the theme-sync effect below.
  }, [monaco, updateContent, setCursorPosition, saveFile])

  // Keep Monaco's theme in sync with the app theme after the editor already exists.
  useEffect(() => {
    if (!monaco) return
    monaco.editor.setTheme(theme === 'light' ? MONACO_LIGHT_THEME : MONACO_DARK_THEME)
  }, [monaco, theme])

  // Same pattern for font size / word wrap, both changeable live from Settings.tsx.
  useEffect(() => {
    editorRef.current?.updateOptions({ fontSize: editorFontSize, wordWrap: editorWordWrap ? 'on' : 'off' })
  }, [editorFontSize, editorWordWrap])

  // Switch the active model when the active file changes — setModel(), never dispose/recreate.
  // Cursor/scroll position is saved per file id before switching away and restored after switching back.
  useEffect(() => {
    if (!monaco || !editorRef.current) return
    const editor = editorRef.current
    const previousFileId = previousFileIdRef.current

    if (previousFileId && previousFileId !== activeFileId) {
      const state = editor.saveViewState()
      if (state) viewStatesRef.current.set(previousFileId, state)
    }

    if (!activeFileId) {
      editor.setModel(null)
      previousFileIdRef.current = null
      return
    }

    const file = openFiles.find((f) => f.id === activeFileId)
    if (!file) return

    let model = modelsRef.current.get(file.id)
    if (!model) {
      // LSP servers key documents by their real absolute filesystem URI (they resolve imports,
      // report diagnostics, etc. against it) — `file.path` alone is workspace-relative, so it has
      // to be joined with the workspace root here rather than passed to `Uri.file()` as-is.
      const absolutePath = workspaceRoot ? `${workspaceRoot.replace(/\/$/, '')}/${file.path}` : file.path
      model = monaco.editor.createModel(
        file.content,
        languageForPath(file.path),
        monaco.Uri.file(absolutePath),
      )
      modelsRef.current.set(file.id, model)
      void lspClient.didOpen(model)
    }
    if (editor.getModel() !== model) {
      editor.setModel(model)
      const savedState = viewStatesRef.current.get(file.id)
      if (savedState) editor.restoreViewState(savedState)
      editor.focus()
    }
    previousFileIdRef.current = file.id
  }, [monaco, activeFileId, openFiles, workspaceRoot])

  // Dispose models for files that have been closed.
  useEffect(() => {
    const openIds = new Set(openFiles.map((f) => f.id))
    for (const [id, model] of modelsRef.current) {
      if (!openIds.has(id)) {
        lspClient.didClose(model)
        model.dispose()
        modelsRef.current.delete(id)
      }
    }
  }, [openFiles])

  return (
    <div className="relative flex-1">
      {!activeFileId && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-base text-text-secondary">
          No file open — select a file from the explorer
        </div>
      )}
      <div ref={containerRef} className="monaco-editor-container" />
    </div>
  )
}
