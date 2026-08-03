# packages/

Shared internal packages consumed by applications in `apps/`.

## Packages

| Folder | Language | Description |
|---|---|---|
| `desktop-types/` | TypeScript | Auto-generated TypeScript types from the FastAPI OpenAPI schema |

## Rules

- Packages are generated or contain pure type definitions — no business logic.
- `desktop-types/` is generated automatically during build; never edit its `src/` contents by hand.
- To add a new shared package, evaluate whether it truly needs to be shared — most code belongs in the application that uses it.
- Packages must be listed as workspace dependencies in `pnpm-workspace.yaml`.
