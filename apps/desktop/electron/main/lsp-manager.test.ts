import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sendMock = vi.fn()
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [{ webContents: { send: sendMock } }],
  },
}))

// This app's own repo root — a real TypeScript project, used as the workspace for a real
// `typescript-language-server` process. Same "real behavior beats a mock" standard
// `docker-service.test.ts`/`git-service.test.ts` set: no part of the LSP wire protocol is
// mocked here, only `BrowserWindow` (nothing to broadcast to in a test run).
const DESKTOP_ROOT = join(__dirname, '../..')
const REAL_FILE = join(DESKTOP_ROOT, 'src/features/editor/language-config.ts')

describe('LspManager (real typescript-language-server process)', () => {
  beforeEach(() => {
    vi.resetModules()
    sendMock.mockReset()
  })

  afterEach(async () => {
    const { lspManager } = await import('./lsp-manager')
    lspManager.stopAll()
  })

  it('starts a real language server and completes initialize', async () => {
    const { lspManager } = await import('./lsp-manager')
    await expect(lspManager.start('typescript', DESKTOP_ROOT)).resolves.toBeUndefined()
  }, 20_000)

  it('is idempotent for the same (language, workspaceRoot) pair — second start resolves immediately', async () => {
    const { lspManager } = await import('./lsp-manager')
    await lspManager.start('typescript', DESKTOP_ROOT)
    await expect(lspManager.start('typescript', DESKTOP_ROOT)).resolves.toBeUndefined()
  }, 20_000)

  it('answers a real textDocument/hover request against a real file in this repo', async () => {
    const { lspManager } = await import('./lsp-manager')
    await lspManager.start('typescript', DESKTOP_ROOT)

    const text = readFileSync(REAL_FILE, 'utf8')
    const uri = `file://${REAL_FILE}`
    await lspManager.notify('typescript', 'textDocument/didOpen', {
      textDocument: { uri, languageId: 'typescript', version: 1, text },
    })

    // `languageForPath` is declared on line 22 (0-indexed line 21) of language-config.ts.
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const hover = (await lspManager.request('typescript', 'textDocument/hover', {
      textDocument: { uri },
      position: { line: 21, character: 20 },
    })) as { contents: unknown } | null

    expect(hover).not.toBeNull()
    expect(JSON.stringify(hover?.contents)).toContain('languageForPath')
  }, 20_000)

  it('answers a real textDocument/completion request with real string-method suggestions', async () => {
    const { lspManager } = await import('./lsp-manager')
    await lspManager.start('typescript', DESKTOP_ROOT)

    const text = readFileSync(REAL_FILE, 'utf8')
    const uri = `file://${REAL_FILE}`
    await lspManager.notify('typescript', 'textDocument/didOpen', {
      textDocument: { uri, languageId: 'typescript', version: 1, text },
    })

    // Line 23 (1-indexed) is `  const fileName = path.split(/[/\\]/).pop() ?? path` — `path` is
    // a `string` parameter, so real member completion right after the `.` should include real
    // `String.prototype` methods, not just an empty/fabricated result.
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const completion = (await lspManager.request('typescript', 'textDocument/completion', {
      textDocument: { uri },
      position: { line: 22, character: 24 },
    })) as { items: { label: string }[] } | { label: string }[] | null

    expect(completion).not.toBeNull()
    const items = Array.isArray(completion) ? completion : completion?.items
    expect(items?.some((item) => item.label === 'split')).toBe(true)
  }, 20_000)

  it('answers a real textDocument/codeAction request with a real typo-fix quick fix', async () => {
    const { lspManager } = await import('./lsp-manager')
    await lspManager.start('typescript', DESKTOP_ROOT)

    // A misspelled reference to a real local (`vlaue` vs `value`) is a basic name-resolution
    // error tsserver always flags regardless of this project's own tsconfig strictness flags
    // (unlike "unused import", which needs `noUnusedLocals` — not set here) — and it always
    // offers a genuine "Change spelling to 'value'" quick fix for it. Proves the codeAction
    // capability wiring (`lsp-manager.ts`'s `initialize` request) gets a real, actionable fix
    // back, not just that the request doesn't error.
    const uri = 'file:///typo-fix-test.ts'
    const text = 'const value = 1\nconsole.log(vlaue)\n'
    await lspManager.notify('typescript', 'textDocument/didOpen', {
      textDocument: { uri, languageId: 'typescript', version: 1, text },
    })
    await new Promise((resolve) => setTimeout(resolve, 1500))

    const range = { start: { line: 1, character: 12 }, end: { line: 1, character: 17 } }
    const codeActions = (await lspManager.request('typescript', 'textDocument/codeAction', {
      textDocument: { uri },
      range,
      context: {
        diagnostics: [
          {
            range,
            message: "Cannot find name 'vlaue'. Did you mean 'value'?",
            severity: 1,
            source: 'typescript',
          },
        ],
      },
    })) as { title: string; edit?: { changes?: Record<string, unknown> } }[]

    expect(codeActions.length).toBeGreaterThan(0)
    expect(codeActions.some((action) => /value/i.test(action.title))).toBe(true)
  }, 20_000)

  it('rejects a request for a language that was never started', async () => {
    const { lspManager } = await import('./lsp-manager')
    await expect(
      lspManager.request('python', 'textDocument/hover', { textDocument: { uri: 'file:///x.py' } }),
    ).rejects.toThrow(/no running/i)
  })

  it('stop() kills the session so later requests reject again', async () => {
    const { lspManager } = await import('./lsp-manager')
    await lspManager.start('typescript', DESKTOP_ROOT)
    lspManager.stop('typescript')

    await expect(
      lspManager.request('typescript', 'textDocument/hover', { textDocument: { uri: 'file:///x.ts' } }),
    ).rejects.toThrow(/no running/i)
  }, 20_000)

  it('forwards server-pushed notifications (diagnostics) to every open BrowserWindow', async () => {
    const { lspManager } = await import('./lsp-manager')
    await lspManager.start('typescript', DESKTOP_ROOT)

    const text = readFileSync(REAL_FILE, 'utf8')
    const uri = `file://${REAL_FILE}`
    await lspManager.notify('typescript', 'textDocument/didOpen', {
      textDocument: { uri, languageId: 'typescript', version: 1, text },
    })

    // A real tsserver project load (even for this one small file) can take a few seconds, more
    // under full-suite CPU contention (real Docker/other subprocess tests running concurrently)
    // — polls with a generous deadline instead of a fixed sleep tuned to one observed timing.
    const deadline = Date.now() + 45_000
    let diagnosticsCall: (typeof sendMock.mock.calls)[number] | undefined
    while (!diagnosticsCall && Date.now() < deadline) {
      diagnosticsCall = sendMock.mock.calls.find(
        (call) =>
          call[0] === 'lsp:notification' &&
          (call[1] as { method?: string }).method === 'textDocument/publishDiagnostics',
      )
      if (!diagnosticsCall) await new Promise((resolve) => setTimeout(resolve, 250))
    }

    expect(diagnosticsCall).toBeDefined()
    expect((diagnosticsCall?.[1] as { language?: string }).language).toBe('typescript')
  }, 50_000)
})
