import { useEffect, useRef, useState } from 'react'
import type * as Monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

let environmentConfigured = false

/** Must run before the first `monaco.editor.create()` call. Idempotent — safe to call from every mount. */
function configureMonacoEnvironment(): void {
  if (environmentConfigured) return
  environmentConfigured = true

  self.MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      switch (label) {
        case 'json':
          return new jsonWorker()
        case 'css':
        case 'scss':
        case 'less':
          return new cssWorker()
        case 'html':
        case 'handlebars':
        case 'razor':
          return new htmlWorker()
        case 'typescript':
        case 'javascript':
          return new tsWorker()
        default:
          return new editorWorker()
      }
    },
  }
}

/** Monaco theme names registered by `defineRasikThemes` — kept in sync with the app's `Theme` setting by `MonacoEditor.tsx`. */
export const MONACO_DARK_THEME = 'rasik-dark'
export const MONACO_LIGHT_THEME = 'rasik-light'

function defineRasikThemes(monaco: typeof Monaco): void {
  monaco.editor.defineTheme(MONACO_DARK_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [{ token: 'comment', foreground: '6a9955' }],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#cccccc',
      'editorLineNumber.foreground': '#858585',
      'editorLineNumber.activeForeground': '#cccccc',
      'editor.selectionBackground': '#264f78',
      'editorCursor.foreground': '#cccccc',
    },
  })

  monaco.editor.defineTheme(MONACO_LIGHT_THEME, {
    base: 'vs',
    inherit: true,
    rules: [{ token: 'comment', foreground: '008000' }],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#3b3b3b',
      'editorLineNumber.foreground': '#717171',
      'editorLineNumber.activeForeground': '#3b3b3b',
      'editor.selectionBackground': '#add6ff',
      'editorCursor.foreground': '#3b3b3b',
    },
  })
}

/** Lazily loads `monaco-editor` (never statically imported — it's ~5MB) and configures workers + both themes exactly once. */
export function useMonaco(): typeof Monaco | null {
  const [monacoInstance, setMonacoInstance] = useState<typeof Monaco | null>(null)
  const loadingRef = useRef(false)

  useEffect(() => {
    if (loadingRef.current || monacoInstance) return
    loadingRef.current = true

    configureMonacoEnvironment()

    void import('monaco-editor').then((monaco) => {
      defineRasikThemes(monaco)
      setMonacoInstance(monaco)
    })
  }, [monacoInstance])

  return monacoInstance
}
