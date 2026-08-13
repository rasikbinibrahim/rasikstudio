import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Monaco from 'monaco-editor'
import type { IpcResult } from '../../types/ipc'
import type { LspNotification } from '../../types/lsp'

// `monaco-editor`'s real dynamic import doesn't resolve under Vitest/Vite (the same known gap
// that's kept `MonacoEditor.tsx` itself untested since Phase 3 — see `TASKS.md`). `lsp-client.ts`
// never imports `monaco-editor` at runtime (only `import type`, erased at build), so a
// hand-built fake covering just the subset of the API it actually calls is enough — this file is
// NOT subject to that same blocker.
interface FakeModel {
  uri: { toString: () => string }
  getLanguageId: () => string
  getVersionId: () => number
  getValue: () => string
  getWordUntilPosition: (position: { lineNumber: number; column: number }) => {
    startColumn: number
    endColumn: number
  }
}

type HoverProvider = { provideHover: (model: FakeModel, position: unknown) => Promise<unknown> }
type DefinitionProvider = { provideDefinition: (model: FakeModel, position: unknown) => Promise<unknown> }
type CompletionProvider = {
  provideCompletionItems: (model: FakeModel, position: unknown) => Promise<unknown>
}
type CodeActionProvider = {
  provideCodeActions: (model: FakeModel, range: unknown, context: unknown) => Promise<unknown>
}

function fakeMonaco() {
  const hoverProviders = new Map<string, HoverProvider>()
  const definitionProviders = new Map<string, DefinitionProvider>()
  const completionProviders = new Map<string, CompletionProvider>()
  const codeActionProviders = new Map<string, CodeActionProvider>()
  const models = new Map<string, FakeModel>()
  const markersByUri = new Map<string, unknown[]>()

  return {
    languages: {
      registerHoverProvider: vi.fn((id: string, provider: HoverProvider) => {
        hoverProviders.set(id, provider)
      }),
      registerDefinitionProvider: vi.fn((id: string, provider: DefinitionProvider) => {
        definitionProviders.set(id, provider)
      }),
      registerCompletionItemProvider: vi.fn((id: string, provider: CompletionProvider) => {
        completionProviders.set(id, provider)
      }),
      registerCodeActionProvider: vi.fn((id: string, provider: CodeActionProvider) => {
        codeActionProviders.set(id, provider)
      }),
      CompletionItemKind: {
        Text: 18,
        Method: 0,
        Function: 1,
        Constructor: 2,
        Field: 3,
        Variable: 4,
        Class: 5,
        Interface: 7,
        Module: 8,
        Property: 9,
        Unit: 12,
        Value: 13,
        Enum: 15,
        Keyword: 17,
        Snippet: 27,
        Color: 19,
        File: 20,
        Reference: 21,
        Folder: 23,
        EnumMember: 16,
        Constant: 14,
        Struct: 6,
        Event: 10,
        Operator: 11,
        TypeParameter: 24,
      },
      CompletionItemInsertTextRule: { None: 0, KeepWhitespace: 1, InsertAsSnippet: 4 },
    },
    editor: {
      getModel: vi.fn((uri: { toString: () => string }) => models.get(uri.toString()) ?? null),
      setModelMarkers: vi.fn((model: FakeModel, _owner: string, data: unknown[]) => {
        markersByUri.set(model.uri.toString(), data)
      }),
    },
    Uri: {
      parse: (value: string) => ({ toString: () => value }),
    },
    MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
    _hoverProviders: hoverProviders,
    _definitionProviders: definitionProviders,
    _completionProviders: completionProviders,
    _codeActionProviders: codeActionProviders,
    _models: models,
    _markersByUri: markersByUri,
    _registerModel: (model: FakeModel) => models.set(model.uri.toString(), model),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double, not the real Monaco type
  } as any
}

/** Typed as the real `Monaco.editor.ITextModel` so it can be passed straight into
 *  `lspClient.didOpen`/`didChange`/`didClose` (which take the real type) as well as into the
 *  fake providers above (which only care about the `FakeModel` subset) — the runtime shape is
 *  the same either way, only the compile-time view differs. */
function fakeModel(uri: string, languageId: string, version = 1, value = 'const x = 1'): Monaco.editor.ITextModel {
  const model: FakeModel = {
    uri: { toString: () => uri },
    getLanguageId: () => languageId,
    getVersionId: () => version,
    getValue: () => value,
    getWordUntilPosition: (position) => ({
      startColumn: Math.max(1, position.column - 3),
      endColumn: position.column,
    }),
  }
  return model as unknown as Monaco.editor.ITextModel
}

function stubLspApi(overrides: Record<string, unknown> = {}): {
  start: ReturnType<typeof vi.fn>
  request: ReturnType<typeof vi.fn>
  notify: ReturnType<typeof vi.fn>
  onNotification: ReturnType<typeof vi.fn>
} {
  const api = {
    start: vi.fn(async (): Promise<IpcResult<null>> => ({ ok: true, data: null })),
    request: vi.fn(async (): Promise<IpcResult<unknown>> => ({ ok: true, data: null })),
    notify: vi.fn(),
    stop: vi.fn(async (): Promise<IpcResult<null>> => ({ ok: true, data: null })),
    onNotification: vi.fn(() => () => undefined),
    ...overrides,
  }
  ;(window as unknown as { rasik: { lsp: unknown } }).rasik = {
    ...(window as unknown as { rasik?: object }).rasik,
    lsp: api,
  }
  return api
}

async function loadClient(): Promise<typeof import('./lsp-client')> {
  return import('./lsp-client')
}

describe('lsp-client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  describe('lspLanguageFor', () => {
    it('maps typescript and javascript to the typescript server', async () => {
      const { lspLanguageFor } = await loadClient()
      expect(lspLanguageFor('typescript')).toBe('typescript')
      expect(lspLanguageFor('javascript')).toBe('typescript')
    })

    it('maps json and python to their own servers, and unlisted languages to null', async () => {
      const { lspLanguageFor } = await loadClient()
      expect(lspLanguageFor('json')).toBe('json')
      expect(lspLanguageFor('python')).toBe('python')
      expect(lspLanguageFor('css')).toBeNull()
      expect(lspLanguageFor('markdown')).toBeNull()
    })
  })

  describe('registerProviders', () => {
    it('registers hover and definition providers for every LSP-backed Monaco language exactly once', async () => {
      stubLspApi()
      const { lspClient } = await loadClient()
      const monaco = fakeMonaco()

      lspClient.registerProviders(monaco)
      lspClient.registerProviders(monaco) // idempotent — second call must not double-register

      // typescript, javascript, json, python
      expect(monaco.languages.registerHoverProvider).toHaveBeenCalledTimes(4)
      expect(monaco.languages.registerDefinitionProvider).toHaveBeenCalledTimes(4)
      expect(monaco.languages.registerCompletionItemProvider).toHaveBeenCalledTimes(4)
      expect(monaco.languages.registerCodeActionProvider).toHaveBeenCalledTimes(4)
    })
  })

  describe('hover provider', () => {
    it('converts a real LSP Hover result (0-based range) into a Monaco Hover (1-based range)', async () => {
      const lspApi = stubLspApi({
        request: vi.fn(async () => ({
          ok: true,
          data: {
            contents: { kind: 'markdown', value: '```typescript\nfunction f(): void\n```' },
            range: { start: { line: 4, character: 2 }, end: { line: 4, character: 10 } },
          },
        })),
      })
      const { lspClient } = await loadClient()
      const monaco = fakeMonaco()
      lspClient.registerProviders(monaco)

      const model = fakeModel('file:///a.ts', 'typescript')
      const provider = monaco._hoverProviders.get('typescript') as HoverProvider
      const result = (await provider.provideHover(model, { lineNumber: 5, column: 3 })) as {
        contents: { value: string }[]
        range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }
      }

      expect(result.contents[0]?.value).toContain('function f(): void')
      expect(result.range).toEqual({
        startLineNumber: 5,
        startColumn: 3,
        endLineNumber: 5,
        endColumn: 11,
      })
      expect(lspApi.request).toHaveBeenCalledWith('typescript', 'textDocument/hover', {
        textDocument: { uri: 'file:///a.ts' },
        position: { line: 4, character: 2 },
      })
    })

    it('returns null without requesting when the server failed to start (e.g. no Python LSP present)', async () => {
      const lspApi = stubLspApi({ start: vi.fn(async () => ({ ok: false, error: 'not found' })) })
      const { lspClient } = await loadClient()
      const monaco = fakeMonaco()
      lspClient.registerProviders(monaco)

      const model = fakeModel('file:///a.py', 'python')
      const provider = monaco._hoverProviders.get('python') as HoverProvider
      const result = await provider.provideHover(model, { lineNumber: 1, column: 1 })

      expect(result).toBeNull()
      expect(lspApi.request).not.toHaveBeenCalled()
    })
  })

  describe('definition provider', () => {
    it('converts a single LSP Location result into a one-element Monaco Definition array', async () => {
      stubLspApi({
        request: vi.fn(async () => ({
          ok: true,
          data: {
            uri: 'file:///b.ts',
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
          },
        })),
      })
      const { lspClient } = await loadClient()
      const monaco = fakeMonaco()
      lspClient.registerProviders(monaco)

      const model = fakeModel('file:///a.ts', 'typescript')
      const provider = monaco._definitionProviders.get('typescript') as DefinitionProvider
      const result = (await provider.provideDefinition(model, { lineNumber: 1, column: 1 })) as {
        uri: { toString: () => string }
        range: unknown
      }[]

      expect(result).toHaveLength(1)
      expect(result[0]?.uri.toString()).toBe('file:///b.ts')
    })

    it('converts a LocationLink result via targetUri/targetRange', async () => {
      stubLspApi({
        request: vi.fn(async () => ({
          ok: true,
          data: [
            {
              targetUri: 'file:///c.ts',
              targetRange: { start: { line: 2, character: 0 }, end: { line: 2, character: 5 } },
              targetSelectionRange: { start: { line: 2, character: 0 }, end: { line: 2, character: 5 } },
            },
          ],
        })),
      })
      const { lspClient } = await loadClient()
      const monaco = fakeMonaco()
      lspClient.registerProviders(monaco)

      const model = fakeModel('file:///a.ts', 'typescript')
      const provider = monaco._definitionProviders.get('typescript') as DefinitionProvider
      const result = (await provider.provideDefinition(model, { lineNumber: 1, column: 1 })) as {
        uri: { toString: () => string }
      }[]

      expect(result[0]?.uri.toString()).toBe('file:///c.ts')
    })

    it('returns null when the server has no definition for the position', async () => {
      stubLspApi({ request: vi.fn(async () => ({ ok: true, data: null })) })
      const { lspClient } = await loadClient()
      const monaco = fakeMonaco()
      lspClient.registerProviders(monaco)

      const model = fakeModel('file:///a.ts', 'typescript')
      const provider = monaco._definitionProviders.get('typescript') as DefinitionProvider
      const result = await provider.provideDefinition(model, { lineNumber: 1, column: 1 })

      expect(result).toBeNull()
    })
  })

  describe('completion provider', () => {
    it('converts real LSP completion items (an array response) into Monaco suggestions with a computed range', async () => {
      const lspApi = stubLspApi({
        request: vi.fn(async () => ({
          ok: true,
          data: [{ label: 'console', kind: 6, detail: 'const console: Console', insertText: 'console' }],
        })),
      })
      const { lspClient } = await loadClient()
      const monaco = fakeMonaco()
      lspClient.registerProviders(monaco)

      const model = fakeModel('file:///a.ts', 'typescript')
      const provider = monaco._completionProviders.get('typescript') as CompletionProvider
      const result = (await provider.provideCompletionItems(model, { lineNumber: 3, column: 8 })) as {
        suggestions: { label: string; insertText: string; kind: number; range: unknown }[]
      }

      expect(result.suggestions).toHaveLength(1)
      expect(result.suggestions[0]).toMatchObject({
        label: 'console',
        insertText: 'console',
        kind: monaco.languages.CompletionItemKind.Variable,
        range: { startLineNumber: 3, endLineNumber: 3, startColumn: 5, endColumn: 8 },
      })
      expect(lspApi.request).toHaveBeenCalledWith('typescript', 'textDocument/completion', {
        textDocument: { uri: 'file:///a.ts' },
        position: { line: 2, character: 7 },
      })
    })

    it('unwraps a CompletionList response and uses its own textEdit range over the computed word range', async () => {
      stubLspApi({
        request: vi.fn(async () => ({
          ok: true,
          data: {
            isIncomplete: false,
            items: [
              {
                label: 'toString',
                insertText: 'toString',
                textEdit: {
                  range: { start: { line: 0, character: 2 }, end: { line: 0, character: 5 } },
                  newText: 'toString()',
                },
              },
            ],
          },
        })),
      })
      const { lspClient } = await loadClient()
      const monaco = fakeMonaco()
      lspClient.registerProviders(monaco)

      const model = fakeModel('file:///a.ts', 'typescript')
      const provider = monaco._completionProviders.get('typescript') as CompletionProvider
      const result = (await provider.provideCompletionItems(model, { lineNumber: 1, column: 6 })) as {
        suggestions: { insertText: string; range: unknown }[]
      }

      expect(result.suggestions[0]).toMatchObject({
        insertText: 'toString()',
        range: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 6 },
      })
    })

    it('marks a snippet-format item with InsertAsSnippet', async () => {
      stubLspApi({
        request: vi.fn(async () => ({
          ok: true,
          data: [{ label: 'for', insertText: 'for (${1:i}) {\n\t$0\n}', insertTextFormat: 2 }],
        })),
      })
      const { lspClient } = await loadClient()
      const monaco = fakeMonaco()
      lspClient.registerProviders(monaco)

      const model = fakeModel('file:///a.ts', 'typescript')
      const provider = monaco._completionProviders.get('typescript') as CompletionProvider
      const result = (await provider.provideCompletionItems(model, { lineNumber: 1, column: 1 })) as {
        suggestions: { insertTextRules: number }[]
      }

      expect(result.suggestions[0]?.insertTextRules).toBe(
        monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      )
    })

    it('returns undefined without requesting when the server failed to start', async () => {
      const lspApi = stubLspApi({ start: vi.fn(async () => ({ ok: false, error: 'not found' })) })
      const { lspClient } = await loadClient()
      const monaco = fakeMonaco()
      lspClient.registerProviders(monaco)

      const model = fakeModel('file:///a.py', 'python')
      const provider = monaco._completionProviders.get('python') as CompletionProvider
      const result = await provider.provideCompletionItems(model, { lineNumber: 1, column: 1 })

      expect(result).toBeUndefined()
      expect(lspApi.request).not.toHaveBeenCalled()
    })
  })

  describe('code action provider', () => {
    it('converts a real quick-fix CodeAction with a workspace edit into a Monaco CodeAction', async () => {
      const lspApi = stubLspApi({
        request: vi.fn(async () => ({
          ok: true,
          data: [
            {
              title: "Add missing import 'foo'",
              kind: 'quickfix',
              isPreferred: true,
              edit: {
                changes: {
                  'file:///a.ts': [
                    {
                      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
                      newText: "import { foo } from './foo'\n",
                    },
                  ],
                },
              },
            },
          ],
        })),
      })
      const { lspClient } = await loadClient()
      const monaco = fakeMonaco()
      lspClient.registerProviders(monaco)

      const model = fakeModel('file:///a.ts', 'typescript')
      const provider = monaco._codeActionProviders.get('typescript') as CodeActionProvider
      const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }
      const result = (await provider.provideCodeActions(model, range, { markers: [] })) as {
        actions: { title: string; kind: string; isPreferred: boolean; edit: { edits: unknown[] } }[]
      }

      expect(result.actions).toHaveLength(1)
      expect(result.actions[0]).toMatchObject({
        title: "Add missing import 'foo'",
        kind: 'quickfix',
        isPreferred: true,
      })
      expect(result.actions[0]?.edit.edits).toEqual([
        {
          resource: { toString: expect.any(Function) },
          textEdit: { range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: "import { foo } from './foo'\n" },
          versionId: undefined,
        },
      ])
      expect(lspApi.request).toHaveBeenCalledWith('typescript', 'textDocument/codeAction', {
        textDocument: { uri: 'file:///a.ts' },
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        context: { diagnostics: [] },
      })
    })

    it('filters out a bare Command with no concrete edit, rather than showing a dead action', async () => {
      stubLspApi({
        request: vi.fn(async () => ({
          ok: true,
          data: [{ title: 'Organize Imports', command: 'typescript.organizeImports', arguments: [] }],
        })),
      })
      const { lspClient } = await loadClient()
      const monaco = fakeMonaco()
      lspClient.registerProviders(monaco)

      const model = fakeModel('file:///a.ts', 'typescript')
      const provider = monaco._codeActionProviders.get('typescript') as CodeActionProvider
      const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }
      const result = (await provider.provideCodeActions(model, range, { markers: [] })) as {
        actions: unknown[]
      }

      expect(result.actions).toEqual([])
    })

    it('converts the current Monaco markers into LSP diagnostics for the request context', async () => {
      const lspApi = stubLspApi({ request: vi.fn(async () => ({ ok: true, data: [] })) })
      const { lspClient } = await loadClient()
      const monaco = fakeMonaco()
      lspClient.registerProviders(monaco)

      const model = fakeModel('file:///a.ts', 'typescript')
      const provider = monaco._codeActionProviders.get('typescript') as CodeActionProvider
      const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 }
      const markers = [
        {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 5,
          severity: monaco.MarkerSeverity.Warning,
          message: 'unused variable',
          source: 'typescript',
        },
      ]

      await provider.provideCodeActions(model, range, { markers })

      expect(lspApi.request).toHaveBeenCalledWith(
        'typescript',
        'textDocument/codeAction',
        expect.objectContaining({
          context: {
            diagnostics: [
              expect.objectContaining({
                message: 'unused variable',
                severity: 2,
                source: 'typescript',
              }),
            ],
          },
        }),
      )
    })

    it('returns an empty action list without requesting when the server failed to start', async () => {
      const lspApi = stubLspApi({ start: vi.fn(async () => ({ ok: false, error: 'not found' })) })
      const { lspClient } = await loadClient()
      const monaco = fakeMonaco()
      lspClient.registerProviders(monaco)

      const model = fakeModel('file:///a.py', 'python')
      const provider = monaco._codeActionProviders.get('python') as CodeActionProvider
      const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }
      const result = await provider.provideCodeActions(model, range, { markers: [] })

      expect(result).toBeUndefined()
      expect(lspApi.request).not.toHaveBeenCalled()
    })
  })

  describe('listenForDiagnostics', () => {
    it('applies publishDiagnostics as Monaco markers on the matching model, converting severity and range', async () => {
      let pushNotification: ((n: LspNotification) => void) | undefined
      stubLspApi({
        onNotification: vi.fn((handler: (n: LspNotification) => void) => {
          pushNotification = handler
          return () => undefined
        }),
      })
      const { lspClient } = await loadClient()
      const monaco = fakeMonaco()
      const model = fakeModel('file:///a.ts', 'typescript')
      monaco._registerModel(model)

      lspClient.listenForDiagnostics(monaco)
      pushNotification?.({
        language: 'typescript',
        method: 'textDocument/publishDiagnostics',
        params: {
          uri: 'file:///a.ts',
          diagnostics: [
            {
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
              severity: 2,
              message: 'unused variable',
              source: 'typescript',
            },
          ],
        },
      })

      expect(monaco.editor.setModelMarkers).toHaveBeenCalledWith(
        model,
        'lsp',
        expect.arrayContaining([
          expect.objectContaining({
            severity: monaco.MarkerSeverity.Warning,
            message: 'unused variable',
            startLineNumber: 1,
            startColumn: 1,
          }),
        ]),
      )
    })

    it('ignores notifications for other methods and for models that are not open', async () => {
      let pushNotification: ((n: LspNotification) => void) | undefined
      stubLspApi({
        onNotification: vi.fn((handler: (n: LspNotification) => void) => {
          pushNotification = handler
          return () => undefined
        }),
      })
      const { lspClient } = await loadClient()
      const monaco = fakeMonaco()

      lspClient.listenForDiagnostics(monaco)
      pushNotification?.({ language: 'typescript', method: 'window/logMessage', params: { message: 'hi' } })
      pushNotification?.({
        language: 'typescript',
        method: 'textDocument/publishDiagnostics',
        params: { uri: 'file:///not-open.ts', diagnostics: [] },
      })

      expect(monaco.editor.setModelMarkers).not.toHaveBeenCalled()
    })
  })

  describe('document sync', () => {
    it('didOpen sends textDocument/didOpen once the server is ready', async () => {
      const lspApi = stubLspApi()
      const { lspClient } = await loadClient()
      const model = fakeModel('file:///a.ts', 'typescript', 1, 'const x = 1')

      await lspClient.didOpen(model)

      expect(lspApi.notify).toHaveBeenCalledWith('typescript', 'textDocument/didOpen', {
        textDocument: { uri: 'file:///a.ts', languageId: 'typescript', version: 1, text: 'const x = 1' },
      })
    })

    it('didOpen is a no-op for a language with no LSP mapping', async () => {
      const lspApi = stubLspApi()
      const { lspClient } = await loadClient()
      const model = fakeModel('file:///a.css', 'css')

      await lspClient.didOpen(model)

      expect(lspApi.start).not.toHaveBeenCalled()
      expect(lspApi.notify).not.toHaveBeenCalled()
    })

    it('didChange sends the new full text once, and skips a redundant call at the same version', async () => {
      const lspApi = stubLspApi()
      const { lspClient } = await loadClient()
      const model = fakeModel('file:///a.ts', 'typescript', 1, 'const x = 1')
      await lspClient.didOpen(model)
      lspApi.notify.mockClear()

      const changed = fakeModel('file:///a.ts', 'typescript', 2, 'const x = 2')
      lspClient.didChange(changed)
      lspClient.didChange(changed) // same version again — must not re-send

      expect(lspApi.notify).toHaveBeenCalledTimes(1)
      expect(lspApi.notify).toHaveBeenCalledWith('typescript', 'textDocument/didChange', {
        textDocument: { uri: 'file:///a.ts', version: 2 },
        contentChanges: [{ text: 'const x = 2' }],
      })
    })

    it('didClose sends textDocument/didClose for a document that was open', async () => {
      const lspApi = stubLspApi()
      const { lspClient } = await loadClient()
      const model = fakeModel('file:///a.ts', 'typescript')
      await lspClient.didOpen(model)
      lspApi.notify.mockClear()

      lspClient.didClose(model)

      expect(lspApi.notify).toHaveBeenCalledWith('typescript', 'textDocument/didClose', {
        textDocument: { uri: 'file:///a.ts' },
      })
    })
  })
})
