# packages/desktop-types/

Auto-generated TypeScript type definitions for the Rasik Studio desktop application. Generated from the FastAPI OpenAPI schema — do not edit `src/` files manually.

## Generation

```bash
# Run after any backend API change
make generate-types

# Which runs:
curl http://localhost:8000/openapi.json | \
  pnpm exec openapi-typescript /dev/stdin -o packages/desktop-types/src/api.d.ts
```

## Usage in the Desktop App

```typescript
import type { ChatSession, Message, AgentTask } from '@rasik-studio/desktop-types'
```

## What's Generated

All request/response schemas, error types, and enum values from the FastAPI backend. Types that are desktop-only (IPC payloads, xterm.js options, Monaco config) are hand-written in `apps/desktop/src/types/` — not here.

## Commitment Policy

The generated file is committed to version control so that CI can detect API drift without running the backend. The `security.yml` workflow verifies that the committed types match the current OpenAPI schema.
