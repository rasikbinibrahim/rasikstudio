# apps/desktop/electron/services/

Long-lived main-process services that do not handle IPC directly but manage background concerns for the lifetime of the application.

## Services (to be created in Phase 3 and Phase 15)

| File | Purpose |
|---|---|
| `auto-updater.ts` | `AutoUpdaterService` — electron-updater lifecycle, update checks, install prompts |
| `app-menu.ts` | `AppMenuService` — native menu bar construction and command routing |
| `protocol-handler.ts` | `ProtocolHandlerService` — registers `app://` protocol for serving renderer assets |
| `tray-manager.ts` | `TrayManager` — system tray icon and menu (future) |

## Rules

- Services are instantiated in `main/index.ts` and live for the duration of the process.
- Services communicate with windows via `BrowserWindow.webContents.send()` — not via the IPC registry.
- Services must clean up resources in their `destroy()` method, called during `app.quit`.
