# Plugin API Reference

> Planned design — see `GETTING_STARTED.md`'s banner. Mirrors `PLUGIN_SYSTEM.md` §4 exactly. No
> `@rasik-studio/plugin-api` package exists to import this type from yet.

The `PluginAPI` object is (per the design) injected into a plugin's sandbox and passed to its
`activate(api)` export — this is the entire surface a plugin can use to interact with the IDE.
Every call is filtered by the permissions declared in the plugin's manifest (`PERMISSIONS.md`);
an unpermitted call returns an error rather than throwing or silently no-op-ing.

```typescript
interface PluginAPI {
  workspace: {
    getRoot(): Promise<string>
    readFile(path: string): Promise<string>
    writeFile(path: string, content: string): Promise<void>
    listFiles(dir: string): Promise<FileEntry[]>
    onFileChanged(handler: (event: FileChangeEvent) => void): Disposable
  }

  editor: {
    getActiveFile(): Promise<OpenFile | null>
    insertAtCursor(text: string): Promise<void>
    replaceSelection(text: string): Promise<void>
    getSelectedText(): Promise<string>
    showDiff(original: string, modified: string, title: string): Promise<void>
  }

  ui: {
    showMessage(message: string, type: 'info' | 'warning' | 'error'): void
    showInputBox(options: InputBoxOptions): Promise<string | null>
    showQuickPick(items: QuickPickItem[]): Promise<QuickPickItem | null>
    registerPanel(panelId: string, component: React.ComponentType): Disposable
  }

  ai: {
    chat(messages: Message[], options?: ChatOptions): Promise<string>
    stream(messages: Message[], onChunk: (delta: string) => void): Promise<void>
    embed(text: string): Promise<number[]>
  }

  commands: {
    register(commandId: string, handler: (...args: unknown[]) => unknown): Disposable
    execute(commandId: string, ...args: unknown[]): Promise<unknown>
  }

  events: {
    on(event: string, handler: (...args: unknown[]) => void): Disposable
    emit(event: string, ...args: unknown[]): void
  }
}
```

## Namespace → required permission

| Namespace | Needs |
|---|---|
| `workspace.readFile`/`listFiles`/`onFileChanged` | `workspace.read` |
| `workspace.writeFile` | `workspace.write` |
| `editor.getActiveFile`/`getSelectedText` | `editor.read` |
| `editor.insertAtCursor`/`replaceSelection`/`showDiff` | `editor.write` |
| `ai.chat`/`stream`/`embed` | `ai.chat` |
| `ui.*`, `commands.*`, `events.*` | No permission — always available once a plugin is active |

## Lifecycle

An entry point exports `activate(api)` (called once, on plugin load) and optionally
`deactivate()` (called on unload — most cleanup is automatic via `Disposable`s returned from
`register`-shaped calls, so this is rarely needed). See `GETTING_STARTED.md` for a worked
example.
