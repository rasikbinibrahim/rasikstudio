import { net, protocol } from 'electron'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

/** `phase-03-desktop-application-shell.md`'s deferred `ProtocolHandlerService` — serves the built
 *  renderer bundle over a custom `app://renderer/...` scheme instead of `file://`. This is what
 *  the doc's "V8 bytecode cache configured via Electron protocol handler" requirement actually
 *  means: Chromium only applies V8's code cache to scripts loaded through its network stack (a
 *  registered `standard` scheme fetched via `net.fetch`), never to raw `file://` reads — there is
 *  no separate cache API to call, registering the scheme correctly is the whole fix. */
export const APP_PROTOCOL_SCHEME = 'app'
export const APP_PROTOCOL_HOST = 'renderer'

/** Must run at module load time, before `app.whenReady()` — Electron only accepts privileged-
 *  scheme registration prior to the app being ready. */
export function registerAppProtocolAsPrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_PROTOCOL_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

/** Installs the `app://` request handler once the app is ready. `rendererDir` is the built
 *  `out/renderer` directory (the same one `index.ts` previously passed to `loadFile()`). Every
 *  request is resolved inside `rendererDir` and rejected (403) if it would escape it — defence in
 *  depth beyond what an `app://renderer/...` same-origin request could already reach, consistent
 *  with `resolveWorkspacePath()`'s traversal guard used everywhere else in this codebase. */
export function installAppProtocolHandler(rendererDir: string): void {
  const root = normalize(rendererDir)

  protocol.handle(APP_PROTOCOL_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.host !== APP_PROTOCOL_HOST) {
      return new Response(null, { status: 404 })
    }

    const relativePath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
    const resolved = normalize(join(root, relativePath))

    if (resolved !== root && !resolved.startsWith(root + sep)) {
      return new Response(null, { status: 403 })
    }

    try {
      return await net.fetch(pathToFileURL(resolved).toString())
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
