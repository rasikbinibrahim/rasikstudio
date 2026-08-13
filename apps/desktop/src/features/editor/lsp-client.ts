import type * as Monaco from 'monaco-editor'
import type {
  CodeAction as LspCodeAction,
  Command as LspCommand,
  CompletionItem as LspCompletionItem,
  CompletionList as LspCompletionList,
  Diagnostic as LspDiagnostic,
  Hover as LspHover,
  Location as LspLocation,
  LocationLink as LspLocationLink,
  MarkupContent,
  Position as LspPosition,
  Range as LspRange,
} from 'vscode-languageserver-protocol'
import type { LspLanguage } from '../../types/lsp'

/** LSP's `InsertTextFormat` enum (1 = PlainText, 2 = Snippet) — only these two values are
 *  standard, so a bare constant is enough without pulling in the whole enum. */
const LSP_INSERT_TEXT_FORMAT_SNIPPET = 2

/** Maps Monaco's language ids (see `language-config.ts`) to the LSP language server that handles
 *  them. `typescript-language-server` itself handles both TS and JS, so both map to the same
 *  running server instance. Anything not listed here (css, markdown, ...) has no LSP integration —
 *  matches `phase-03-desktop-application-shell.md`'s 3 "bundled servers" (TS/Python/JSON), not a
 *  gap in this mapping. */
const MONACO_LANGUAGE_TO_LSP: Partial<Record<string, LspLanguage>> = {
  typescript: 'typescript',
  javascript: 'typescript',
  json: 'json',
  python: 'python',
}

const LSP_MONACO_LANGUAGE_IDS: Record<LspLanguage, string[]> = {
  typescript: ['typescript', 'javascript'],
  json: ['json'],
  python: ['python'],
}

export function lspLanguageFor(monacoLanguageId: string): LspLanguage | null {
  return MONACO_LANGUAGE_TO_LSP[monacoLanguageId] ?? null
}

function toMonacoPosition(position: { lineNumber: number; column: number }): LspPosition {
  return { line: position.lineNumber - 1, character: position.column - 1 }
}

function toLspTextDocumentPosition(model: Monaco.editor.ITextModel, position: Monaco.Position) {
  return {
    textDocument: { uri: model.uri.toString() },
    position: toMonacoPosition(position),
  }
}

function fromLspRange(range: LspRange): Monaco.IRange {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  }
}

function isMarkupContent(value: unknown): value is MarkupContent {
  return typeof value === 'object' && value !== null && 'kind' in value && 'value' in value
}

function hoverContentsToString(contents: LspHover['contents']): string {
  if (typeof contents === 'string') return contents
  if (isMarkupContent(contents)) return contents.value
  if (Array.isArray(contents)) {
    return contents
      .map((entry) => (typeof entry === 'string' ? entry : `\`\`\`${entry.language}\n${entry.value}\n\`\`\``))
      .join('\n\n')
  }
  // Single MarkedString object ({ language, value })
  return `\`\`\`${contents.language}\n${contents.value}\n\`\`\``
}

/** `Diagnostic.message` widened to `string | MarkupContent` in protocol 3.18 (guarded by a
 *  `markupMessageSupport` client capability this app doesn't advertise in its `initialize`
 *  request) — real servers only ever send plain strings today, but the type allows both. */
function diagnosticMessageToString(message: string | MarkupContent): string {
  return typeof message === 'string' ? message : message.value
}

function toMonacoHover(hover: LspHover): Monaco.languages.Hover {
  return {
    contents: [{ value: hoverContentsToString(hover.contents) }],
    range: hover.range ? fromLspRange(hover.range) : undefined,
  }
}

function isLocationLink(value: LspLocation | LspLocationLink): value is LspLocationLink {
  return 'targetUri' in value
}

function toMonacoDefinition(
  monaco: typeof Monaco,
  result: LspLocation | LspLocation[] | LspLocationLink[] | null,
): Monaco.languages.Definition | null {
  if (!result) return null
  const locations = Array.isArray(result) ? result : [result]
  return locations.map((location) => {
    if (isLocationLink(location)) {
      return {
        uri: monaco.Uri.parse(location.targetUri),
        range: fromLspRange(location.targetRange),
      }
    }
    return { uri: monaco.Uri.parse(location.uri), range: fromLspRange(location.range) }
  })
}

const SEVERITY_TO_MONACO: Record<number, number> = {}

function severityToMonaco(monaco: typeof Monaco, severity: number | undefined): Monaco.MarkerSeverity {
  if (Object.keys(SEVERITY_TO_MONACO).length === 0) {
    SEVERITY_TO_MONACO[1] = monaco.MarkerSeverity.Error
    SEVERITY_TO_MONACO[2] = monaco.MarkerSeverity.Warning
    SEVERITY_TO_MONACO[3] = monaco.MarkerSeverity.Info
    SEVERITY_TO_MONACO[4] = monaco.MarkerSeverity.Hint
  }
  return (SEVERITY_TO_MONACO[severity ?? 1] ?? monaco.MarkerSeverity.Error) as Monaco.MarkerSeverity
}

function toMonacoMarker(monaco: typeof Monaco, diagnostic: LspDiagnostic): Monaco.editor.IMarkerData {
  return {
    ...fromLspRange(diagnostic.range),
    severity: severityToMonaco(monaco, diagnostic.severity),
    message: diagnosticMessageToString(diagnostic.message),
    source: diagnostic.source,
    code: diagnostic.code?.toString(),
  }
}

function toLspRange(range: Monaco.IRange): LspRange {
  return {
    start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
    end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
  }
}

const MONACO_SEVERITY_TO_LSP: Record<number, 1 | 2 | 3 | 4> = {}

/** Reverse of `severityToMonaco` — Monaco's `MarkerSeverity` values are bit-flag constants
 *  (Hint=1, Info=2, Warning=4, Error=8), not the sequential 1-4 LSP uses, so this can't be a
 *  simple arithmetic inverse and needs its own lazily-built lookup table, same pattern. */
function severityToLsp(monaco: typeof Monaco, severity: number): 1 | 2 | 3 | 4 {
  if (Object.keys(MONACO_SEVERITY_TO_LSP).length === 0) {
    MONACO_SEVERITY_TO_LSP[monaco.MarkerSeverity.Error] = 1
    MONACO_SEVERITY_TO_LSP[monaco.MarkerSeverity.Warning] = 2
    MONACO_SEVERITY_TO_LSP[monaco.MarkerSeverity.Info] = 3
    MONACO_SEVERITY_TO_LSP[monaco.MarkerSeverity.Hint] = 4
  }
  return MONACO_SEVERITY_TO_LSP[severity] ?? 1
}

/** Converts a currently-displayed Monaco marker back into an LSP `Diagnostic` for
 *  `textDocument/codeAction`'s required `context.diagnostics` — round-trips what
 *  `toMonacoMarker` produced in the first place, so a server's own diagnostics (the common case,
 *  since `listenForDiagnostics` sets every marker with `owner: 'lsp'`) survive intact. */
function toLspDiagnosticFromMarker(monaco: typeof Monaco, marker: Monaco.editor.IMarkerData): LspDiagnostic {
  return {
    range: toLspRange(marker),
    message: marker.message,
    severity: severityToLsp(monaco, marker.severity),
    source: marker.source,
    code: marker.code as string | number | undefined,
  }
}

const COMPLETION_KIND_TO_MONACO: Record<number, number> = {}

function completionKindToMonaco(
  monaco: typeof Monaco,
  kind: number | undefined,
): Monaco.languages.CompletionItemKind {
  if (Object.keys(COMPLETION_KIND_TO_MONACO).length === 0) {
    const K = monaco.languages.CompletionItemKind
    Object.assign(COMPLETION_KIND_TO_MONACO, {
      1: K.Text,
      2: K.Method,
      3: K.Function,
      4: K.Constructor,
      5: K.Field,
      6: K.Variable,
      7: K.Class,
      8: K.Interface,
      9: K.Module,
      10: K.Property,
      11: K.Unit,
      12: K.Value,
      13: K.Enum,
      14: K.Keyword,
      15: K.Snippet,
      16: K.Color,
      17: K.File,
      18: K.Reference,
      19: K.Folder,
      20: K.EnumMember,
      21: K.Constant,
      22: K.Struct,
      23: K.Event,
      24: K.Operator,
      25: K.TypeParameter,
    })
  }
  return (COMPLETION_KIND_TO_MONACO[kind ?? 1] ?? monaco.languages.CompletionItemKind.Text) as Monaco.languages.CompletionItemKind
}

/** `item.textEdit` can be a plain `TextEdit` (`range` + `newText`) or, since LSP 3.16, an
 *  `InsertReplaceEdit` (`insert`/`replace` ranges instead of one `range`) when the client
 *  advertises `insertReplaceSupport` — this app doesn't (see `lsp-manager.ts`'s `initialize`
 *  capabilities), so real servers only ever send the plain form here; the type still allows
 *  both, so this narrows defensively rather than assuming. */
function toMonacoCompletionItem(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
  item: LspCompletionItem,
): Monaco.languages.CompletionItem {
  const word = model.getWordUntilPosition(position)
  const defaultRange: Monaco.IRange = {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  }
  const plainTextEdit = item.textEdit && 'range' in item.textEdit ? item.textEdit : undefined

  return {
    label: item.label,
    kind: completionKindToMonaco(monaco, item.kind),
    detail: item.detail,
    documentation: isMarkupContent(item.documentation) ? { value: item.documentation.value } : item.documentation,
    sortText: item.sortText,
    filterText: item.filterText,
    preselect: item.preselect,
    insertText: plainTextEdit?.newText ?? item.insertText ?? item.label,
    insertTextRules:
      item.insertTextFormat === LSP_INSERT_TEXT_FORMAT_SNIPPET
        ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        : undefined,
    range: plainTextEdit ? fromLspRange(plainTextEdit.range) : defaultRange,
  }
}

interface LspTextEditLike {
  range: LspRange
  newText: string
}

/** Only quick-fixes/refactors that arrive as a concrete `WorkspaceEdit.changes` map (the plain,
 *  spec-standard form both `typescript-language-server` and `pylsp` use) are actionable here —
 *  `documentChanges` (versioned/file-rename edits) and bare `Command`-only actions (would need a
 *  `workspace/executeCommand` bridge this app doesn't have) are filtered out rather than shown as
 *  an action that does nothing when clicked. */
function toMonacoCodeAction(
  monaco: typeof Monaco,
  item: LspCodeAction | LspCommand,
): Monaco.languages.CodeAction | null {
  if (!('edit' in item) || !item.edit?.changes) return null

  const edits: Monaco.languages.IWorkspaceTextEdit[] = []
  for (const [uri, textEdits] of Object.entries(item.edit.changes)) {
    for (const textEdit of textEdits as LspTextEditLike[]) {
      edits.push({
        resource: monaco.Uri.parse(uri),
        textEdit: { range: fromLspRange(textEdit.range), text: textEdit.newText },
        versionId: undefined,
      })
    }
  }
  if (edits.length === 0) return null

  return { title: item.title, kind: item.kind, isPreferred: item.isPreferred, edit: { edits } }
}

/** Renderer-side LSP integration: starts servers on demand, registers Monaco hover/definition
 *  providers once per language, keeps servers in sync with open documents (didOpen/didChange/
 *  didClose), and applies `publishDiagnostics` notifications as Monaco markers. A module-level
 *  singleton — there is exactly one of these per renderer process, same as `useMonaco`'s
 *  module-level `environmentConfigured` flag. */
class LspClient {
  private readonly startPromises = new Map<LspLanguage, Promise<boolean>>()
  private readonly ready = new Set<LspLanguage>()
  private readonly providersRegistered = new Set<LspLanguage>()
  private readonly openDocumentVersions = new Map<string, number>()
  private diagnosticsUnsubscribe: (() => void) | null = null

  /** Resolves `true` once the server is initialized, `false` if it couldn't start (e.g. no Python
   *  LSP available on this machine) — callers treat `false` as "no LSP for this file", not an
   *  error to surface, since it's a real, expected environment gap for Python. */
  async ensureStarted(language: LspLanguage): Promise<boolean> {
    if (this.ready.has(language)) return true
    let promise = this.startPromises.get(language)
    if (!promise) {
      promise = window.rasik.lsp.start(language).then((result) => {
        if (result.ok) {
          this.ready.add(language)
          return true
        }
        console.warn(`[lsp] ${language} server unavailable: ${result.error}`)
        return false
      })
      this.startPromises.set(language, promise)
    }
    return promise
  }

  registerProviders(monaco: typeof Monaco): void {
    for (const language of Object.keys(LSP_MONACO_LANGUAGE_IDS) as LspLanguage[]) {
      if (this.providersRegistered.has(language)) continue
      this.providersRegistered.add(language)

      for (const monacoLanguageId of LSP_MONACO_LANGUAGE_IDS[language]) {
        monaco.languages.registerHoverProvider(monacoLanguageId, {
          provideHover: async (model, position) => {
            if (!(await this.ensureStarted(language))) return null
            const result = await window.rasik.lsp.request(
              language,
              'textDocument/hover',
              toLspTextDocumentPosition(model, position),
            )
            if (!result.ok || !result.data) return null
            return toMonacoHover(result.data as LspHover)
          },
        })

        monaco.languages.registerDefinitionProvider(monacoLanguageId, {
          provideDefinition: async (model, position) => {
            if (!(await this.ensureStarted(language))) return null
            const result = await window.rasik.lsp.request(
              language,
              'textDocument/definition',
              toLspTextDocumentPosition(model, position),
            )
            if (!result.ok || !result.data) return null
            return toMonacoDefinition(
              monaco,
              result.data as LspLocation | LspLocation[] | LspLocationLink[] | null,
            )
          },
        })

        monaco.languages.registerCompletionItemProvider(monacoLanguageId, {
          triggerCharacters: ['.', '"', "'", '/', '@', '<'],
          provideCompletionItems: async (model, position) => {
            if (!(await this.ensureStarted(language))) return undefined
            const result = await window.rasik.lsp.request(
              language,
              'textDocument/completion',
              toLspTextDocumentPosition(model, position),
            )
            if (!result.ok || !result.data) return undefined
            const data = result.data as LspCompletionItem[] | LspCompletionList
            const items = Array.isArray(data) ? data : data.items
            return {
              suggestions: items.map((item) => toMonacoCompletionItem(monaco, model, position, item)),
            }
          },
        })

        monaco.languages.registerCodeActionProvider(monacoLanguageId, {
          provideCodeActions: async (model, range, context) => {
            if (!(await this.ensureStarted(language))) return undefined
            const result = await window.rasik.lsp.request(language, 'textDocument/codeAction', {
              textDocument: { uri: model.uri.toString() },
              range: toLspRange(range),
              context: {
                diagnostics: context.markers.map((marker) => toLspDiagnosticFromMarker(monaco, marker)),
              },
            })
            if (!result.ok || !result.data) return { actions: [], dispose: () => undefined }
            const actions = (result.data as (LspCodeAction | LspCommand)[])
              .map((item) => toMonacoCodeAction(monaco, item))
              .filter((action): action is Monaco.languages.CodeAction => action !== null)
            return { actions, dispose: () => undefined }
          },
        })
      }
    }
  }

  /** Subscribes to server-pushed diagnostics exactly once per renderer lifetime. Returns nothing
   *  meaningful to unsubscribe to — there is no natural "stop listening" moment for the app's own
   *  lifetime, mirroring how `useMonaco`'s worker configuration is also a permanent, one-time
   *  setup. */
  listenForDiagnostics(monaco: typeof Monaco): void {
    if (this.diagnosticsUnsubscribe) return
    this.diagnosticsUnsubscribe = window.rasik.lsp.onNotification((notification) => {
      if (notification.method !== 'textDocument/publishDiagnostics') return
      const { uri, diagnostics } = notification.params as { uri: string; diagnostics: LspDiagnostic[] }
      const model = monaco.editor.getModel(monaco.Uri.parse(uri))
      if (!model) return
      monaco.editor.setModelMarkers(
        model,
        'lsp',
        diagnostics.map((diagnostic) => toMonacoMarker(monaco, diagnostic)),
      )
    })
  }

  async didOpen(model: Monaco.editor.ITextModel): Promise<void> {
    const language = lspLanguageFor(model.getLanguageId())
    if (!language || !(await this.ensureStarted(language))) return
    const uri = model.uri.toString()
    this.openDocumentVersions.set(uri, model.getVersionId())
    window.rasik.lsp.notify(language, 'textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: model.getLanguageId(),
        version: model.getVersionId(),
        text: model.getValue(),
      },
    })
  }

  didChange(model: Monaco.editor.ITextModel): void {
    const language = lspLanguageFor(model.getLanguageId())
    if (!language || !this.ready.has(language)) return
    const uri = model.uri.toString()
    const version = model.getVersionId()
    if (this.openDocumentVersions.get(uri) === version) return
    this.openDocumentVersions.set(uri, version)
    // Full-document sync (`TextDocumentSyncKind.Full`) — simpler and robust; incremental sync
    // would need Monaco's edit deltas translated to LSP `TextDocumentContentChangeEvent` ranges,
    // not worth the complexity for this app's editor-model scale.
    window.rasik.lsp.notify(language, 'textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: [{ text: model.getValue() }],
    })
  }

  didClose(model: Monaco.editor.ITextModel): void {
    const language = lspLanguageFor(model.getLanguageId())
    const uri = model.uri.toString()
    this.openDocumentVersions.delete(uri)
    if (!language || !this.ready.has(language)) return
    window.rasik.lsp.notify(language, 'textDocument/didClose', { textDocument: { uri } })
  }
}

export const lspClient = new LspClient()
