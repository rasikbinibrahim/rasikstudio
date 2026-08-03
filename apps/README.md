# apps/

Deployable applications in the Rasik Studio monorepo.

## Applications

| Folder | Type | Description |
|---|---|---|
| `desktop/` | Electron app | The cross-platform IDE desktop application |
| `backend/` | FastAPI service | The AI, storage, and agent backend service |

## Rules

- Each application is a fully self-contained pnpm/Python package with its own `package.json` or `pyproject.toml`.
- Applications may not import from each other's source directories.
- Shared code between applications belongs in `packages/`, not here.
- The desktop app communicates with the backend only via HTTP and WebSocket — never via direct imports.
