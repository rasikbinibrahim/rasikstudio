import { BrowserWindow } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from 'vscode-jsonrpc/node'

/** The 3 language servers `phase-03-desktop-application-shell.md` names as "bundled": TypeScript
 *  (`typescript-language-server`) and JSON (`vscode-langservers-extracted`'s json server) are real
 *  npm dependencies of this package, spawned via `process.execPath` so they need no separate
 *  runtime. Python (`pylsp`) has no equivalent pure-JS distribution — it's resolved from the host
 *  machine instead (a `pylsp` on PATH, or `uvx` if present, which this monorepo's own backend
 *  already depends on for its Python tooling). See `resolvePythonServerCommand()`'s doc comment for
 *  the honest scope boundary this implies. */
export type LspLanguage = 'typescript' | 'python' | 'json'

interface ServerCommand {
  command: string
  args: string[]
  env?: Record<string, string>
}

interface LspSession {
  language: LspLanguage
  workspaceRoot: string
  child: ChildProcessWithoutNullStreams
  connection: MessageConnection
  ready: Promise<void>
}

const INITIALIZE_TIMEOUT_MS = 20_000

/** Single window today, same limitation `PtyManager.broadcast()` documents — see its comment. */
function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args)
  }
}

/** Package.json's `bin` field can be a string (single-bin package) or a map keyed by command name
 *  (multi-bin, e.g. `vscode-langservers-extracted`) — resolved via real `require` filesystem
 *  lookups, which work transparently against paths inside `app.asar` in a packaged build (Node's
 *  `require`/`fs` are asar-aware inside any Electron-embedded runtime, including a spawned
 *  `ELECTRON_RUN_AS_NODE` child process — see `electron-builder.config.ts`'s `asarUnpack` comment
 *  for how this was verified). */
function resolveBundledServerScript(packageName: string, binKey: string): string {
  const pkgJsonPath = require.resolve(`${packageName}/package.json`)
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- runtime path resolution, not a static import
  const pkg = require(pkgJsonPath) as { bin?: string | Record<string, string> }
  const binField = pkg.bin
  const relative = typeof binField === 'string' ? binField : binField?.[binKey]
  if (!relative) throw new Error(`${packageName}: no "${binKey}" bin entry in package.json`)
  return join(dirname(pkgJsonPath), relative)
}

/** Pure PATH search, no subprocess spawned to test existence — avoids any shell-invocation
 *  surface for what would otherwise be a `command -v`/`where` shell-out. */
function findOnPath(command: string): string | null {
  const pathEnv = process.env['PATH'] ?? process.env['Path'] ?? ''
  const extensions =
    process.platform === 'win32' ? (process.env['PATHEXT'] ?? '.EXE;.CMD;.BAT').split(';') : ['']
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue
    for (const ext of extensions) {
      const candidate = join(dir, command + ext)
      try {
        accessSync(candidate, constants.X_OK)
        return candidate
      } catch {
        // not here — keep searching
      }
    }
  }
  return null
}

/** No pure-JS Python language server exists to bundle the way TS/JSON's servers are bundled as
 *  npm dependencies. Resolution order: a `pylsp` already on the user's PATH (respects whatever
 *  Python environment they've set up), then `uv`/`uvx` (this repo's own backend tooling — if
 *  present, `uvx --from python-lsp-server pylsp` fetches it into uv's cache on first use, no
 *  permanent install needed). Neither present → Python language features are unavailable, reported
 *  as a real `start()` rejection rather than silently doing nothing. */
function resolvePythonServerCommand(): ServerCommand | null {
  const pylsp = findOnPath('pylsp')
  if (pylsp) return { command: pylsp, args: [] }

  const uvx = findOnPath('uvx')
  if (uvx) return { command: uvx, args: ['--from', 'python-lsp-server', 'pylsp'] }

  return null
}

function resolveServerCommand(language: LspLanguage): ServerCommand | null {
  switch (language) {
    case 'typescript': {
      const script = resolveBundledServerScript(
        'typescript-language-server',
        'typescript-language-server',
      )
      // `process.execPath` inside Electron's main process is the Electron binary itself, not
      // plain Node — without `ELECTRON_RUN_AS_NODE`, it would try to launch `script` as if it
      // were a whole Electron app rather than running it as a Node script.
      return { command: process.execPath, args: [script, '--stdio'], env: { ELECTRON_RUN_AS_NODE: '1' } }
    }
    case 'json': {
      const script = resolveBundledServerScript(
        'vscode-langservers-extracted',
        'vscode-json-language-server',
      )
      return { command: process.execPath, args: [script, '--stdio'], env: { ELECTRON_RUN_AS_NODE: '1' } }
    }
    case 'python':
      return resolvePythonServerCommand()
  }
}

class LspManager {
  private readonly sessions = new Map<LspLanguage, LspSession>()

  /** Idempotent for the same (language, workspaceRoot) pair. Restarts the server if the
   *  workspace root changed since the last start (a different folder was opened). Rejects if the
   *  server binary can't be resolved/spawned, or if `initialize` doesn't complete within
   *  `INITIALIZE_TIMEOUT_MS` — callers surface this as a real error, not a silent no-op. */
  async start(language: LspLanguage, workspaceRoot: string): Promise<void> {
    const existing = this.sessions.get(language)
    if (existing) {
      if (existing.workspaceRoot === workspaceRoot) return existing.ready
      this.stop(language)
    }

    const command = resolveServerCommand(language)
    if (!command) {
      throw new Error(
        language === 'python'
          ? 'No Python language server available: install "python-lsp-server" (pylsp) or "uv" and try again.'
          : `No language server command resolved for "${language}".`,
      )
    }

    const child = spawn(command.command, command.args, {
      cwd: workspaceRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: command.env ? { ...process.env, ...command.env } : process.env,
    })

    const connection = createMessageConnection(
      new StreamMessageReader(child.stdout),
      new StreamMessageWriter(child.stdin),
    )

    // A write can race the child process's own exit (e.g. `stop()` disposing the connection
    // right as the server is shutting down) — without a listener, the resulting EPIPE on the
    // stdin socket becomes an unhandled rejection that crashes the main process instead of a
    // harmless, already-shutting-down no-op.
    child.stdin.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EPIPE') console.warn(`[lsp:${language}] stdin error: ${err.message}`)
    })

    child.stderr.on('data', (chunk: Buffer) => {
      console.warn(`[lsp:${language}] ${chunk.toString().slice(0, 500)}`)
    })

    // Catch-all: forwards every server-initiated notification (diagnostics, log messages, ...)
    // to the renderer. `lsp-client.ts` picks out the ones it acts on (publishDiagnostics) and
    // ignores the rest, rather than this layer maintaining a per-method allowlist.
    connection.onNotification((method: string, params: unknown) => {
      broadcast('lsp:notification', { language, method, params })
    })

    // Catch-all for server-initiated *requests* (workspace/configuration,
    // client/registerCapability, window/workDoneProgress/create, ...) — real servers send these
    // and block waiting for a reply. We don't implement configuration/capability negotiation, so
    // every one gets a minimal-but-valid reply instead of hanging the server indefinitely.
    connection.onRequest((method: string, params: unknown) => {
      if (method === 'workspace/configuration') {
        const items = (params as { items?: unknown[] } | undefined)?.items ?? []
        return items.map(() => null)
      }
      return null
    })

    connection.onDispose(() => {
      this.sessions.delete(language)
    })

    connection.listen()

    const ready = (async (): Promise<void> => {
      const initializeResult = connection.sendRequest('initialize', {
        processId: process.pid,
        rootUri: `file://${workspaceRoot}`,
        capabilities: {
          textDocument: {
            synchronization: { didSave: true },
            hover: { contentFormat: ['markdown', 'plaintext'] },
            definition: { linkSupport: false },
            publishDiagnostics: { relatedInformation: true },
            completion: {
              completionItem: { snippetSupport: true, documentationFormat: ['markdown', 'plaintext'] },
            },
            codeAction: {
              // Declares support for the modern, structured `CodeAction` response shape — without
              // this, some servers fall back to returning bare `Command` objects only, which
              // `lsp-client.ts`'s `toMonacoCodeAction` deliberately can't act on (no
              // `workspace/executeCommand` bridge exists).
              codeActionLiteralSupport: { codeActionKind: { valueSet: ['quickfix', 'refactor', 'source'] } },
            },
          },
          workspace: { workspaceFolders: false, configuration: true },
        },
      })

      const timeout = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`[lsp:${language}] initialize timed out after ${INITIALIZE_TIMEOUT_MS}ms`)),
          INITIALIZE_TIMEOUT_MS,
        )
      })

      await Promise.race([initializeResult, timeout])
      await connection.sendNotification('initialized', {})
      console.info(`[lsp:${language}] ready (cwd=${workspaceRoot})`)
    })()

    this.sessions.set(language, { language, workspaceRoot, child, connection, ready })

    try {
      await ready
    } catch (err) {
      this.stop(language)
      throw err
    }
  }

  async request(language: LspLanguage, method: string, params: unknown): Promise<unknown> {
    const session = this.sessions.get(language)
    if (!session) throw new Error(`No running "${language}" language server`)
    await session.ready
    return session.connection.sendRequest(method, params)
  }

  async notify(language: LspLanguage, method: string, params: unknown): Promise<void> {
    const session = this.sessions.get(language)
    if (!session) throw new Error(`No running "${language}" language server`)
    await session.ready
    // `sendNotification`'s returned promise can reject if the write races the server process
    // exiting (e.g. a notification sent just as `stop()` tears the session down) — awaited here
    // so that's a normal rejection callers can `.catch()`, not an unhandled one.
    await session.connection.sendNotification(method, params)
  }

  stop(language: LspLanguage): void {
    const session = this.sessions.get(language)
    if (!session) return
    session.connection.dispose()
    session.child.kill()
    this.sessions.delete(language)
  }

  /** Called on app quit so no orphaned language-server processes survive the window closing —
   *  same reasoning as `PtyManager.killAll()`. */
  stopAll(): void {
    for (const language of Array.from(this.sessions.keys())) this.stop(language)
  }
}

export const lspManager = new LspManager()
