# docs/reference/vscodium/

Analysis of the VSCodium project — the MIT-licensed build of VS Code without Microsoft telemetry. Reference for IDE shell design, extension host architecture, and process model.

## Files (to be created in Phase 1)

| File | Contents |
|---|---|
| `ANALYSIS.md` | Full 11-dimension analysis |
| `ARCHITECTURE_NOTES.md` | Process model (main, renderer, extension host), IPC patterns |
| `LICENSE_NOTES.md` | MIT license requirements, attribution obligations |

## Key Questions to Answer in Analysis

- How does the extension host process isolate extensions from the main IDE?
- How does the contextBridge pattern compare to VS Code's IPC?
- Which VS Code modules are reusable under MIT license?
- What makes VS Code's file tree virtualization fast?
