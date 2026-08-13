# Plugin Sandbox Model

> Planned design — see `GETTING_STARTED.md`'s banner. Mirrors `PLUGIN_SYSTEM.md` §6/§12 exactly.

```
Plugin Code
    │
    ▼
Electron Sandbox (renderer subprocess)
    - contextIsolation: true
    - nodeIntegration: false
    - No access to Node.js APIs
    - No access to Electron APIs
    │
    ▼
Plugin API Bridge (IPC)
    - Only declared, user-approved permissions are forwarded
    - All calls go through validation
    │
    ▼
Rasik Studio Main Process / Backend
```

This mirrors the exact `contextIsolation`/`nodeIntegration: false` boundary this app's own
renderer already runs under (see `SECURITY_GUIDELINES.md`) — a plugin would run in an even more
restricted version of that same boundary, one level further removed from Node/Electron APIs than
the app's own renderer code is.

## UI plugins

Sidebar-panel plugins render in an isolated `<iframe>` or a sandboxed React tree communicating
via `postMessage`, not directly in the main UI's own React tree — this prevents a plugin from
injecting arbitrary scripts into, or reading state from, the host application's own DOM.

## Additional runtime constraints (design)

- **Network requests are proxied through the backend** (for logging and `network.fetch:own`
  allowlist enforcement), not made directly from the plugin sandbox.
- **Checksums are verified on every load**, not just at install time, to detect tampering.
- **Resource limits**: a plugin sandbox exceeding 256MB memory or 80% CPU for more than 5 seconds
  is killed.

## What this means in practice, once built

A plugin cannot read your filesystem outside the declared `workspace.*` permission grants, cannot
spawn processes without `workspace.shell` (explicitly warned about), and cannot make network
calls without `network.fetch`/`network.fetch:own`. A malicious or buggy plugin is contained to
whatever it explicitly declared and the user explicitly approved.
