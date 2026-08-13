# Monaco Editor — Electron Setup Notes

How this project configures Monaco web workers in Electron (`getWorkerUrl`/`getWorker`), as
actually implemented in `apps/desktop/src/features/editor/useMonaco.ts`.

## The problem Monaco's worker API solves

Monaco needs to spawn several Web Workers (one for core editor tokenization, one each for
JSON/CSS/HTML/TypeScript language services) but has no way to know, at its own build time, what
URL those worker scripts will be served from in *this* app's specific bundler output — that
depends entirely on the consuming project's build tool. Monaco's answer is
`self.MonacoEnvironment.getWorker(workerId, label)`, a callback the consumer must set *before*
the first `monaco.editor.create()` call, returning a real `Worker` instance for a given language
label.

## This project's real implementation

`configureMonacoEnvironment()` (`useMonaco.ts:11`) sets exactly this callback, using Vite's
`?worker` import suffix to get each worker as an importable constructor:

```ts
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
// ...css, html, ts workers similarly

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    switch (label) {
      case 'json': return new jsonWorker()
      case 'css': case 'scss': case 'less': return new cssWorker()
      case 'html': case 'handlebars': case 'razor': return new htmlWorker()
      case 'typescript': case 'javascript': return new tsWorker()
      default: return new editorWorker()
    }
  },
}
```

Two real, non-obvious things worth naming precisely:

- **`environmentConfigured` module-level guard** (`useMonaco.ts:9`) — `configureMonacoEnvironment()`
  is idempotent, safe to call from every `useMonaco()` hook mount (every open Monaco instance
  calls it), but only actually assigns `MonacoEnvironment` once. Assigning it twice wouldn't
  technically break anything (the second assignment would just overwrite the first with an
  identical callback), but the guard makes the intent explicit rather than relying on that
  coincidence.
- **This is Electron-renderer-process code, not Electron-main-process code** — `self` here refers
  to the renderer's own `window`/worker-global context (Monaco itself runs entirely in the
  renderer, same as it would in a plain browser tab). No `electron`-specific API is used anywhere
  in this setup; the only Electron-specific consideration is that this project's
  `contextIsolation: true` + strict CSP (`SECURITY_GUIDELINES.md`) must permit worker script
  execution from the app's own bundled origin, which Vite's `?worker` output (served from the
  same `app://renderer/...` privileged scheme as the rest of the bundle — see
  `protocol-handler.ts`, Phase 3) satisfies without any extra CSP directive.

## Why not `getWorkerUrl` (Monaco's older API)

Monaco's docs describe two APIs: the newer `getWorker(workerId, label) -> Worker` (used here) and
an older `getWorkerUrl(workerId, label) -> string` (return a URL, let Monaco construct the
`Worker` itself). `getWorker` is the right choice for a bundler-based setup like Vite's `?worker`
imports, since it hands Monaco an already-constructed worker rather than requiring a URL Vite's
dev server and production build would need to expose identically — `getWorkerUrl` is more suited
to a setup serving worker scripts from a static, predictable path (e.g. a CDN-hosted Monaco
build), which this project's bundled-into-the-app-asar deployment model doesn't match.
