# apps/backend/app/

The FastAPI application source. Organized by Clean Architecture layers with one additional top-level module for the agent orchestration system.

## Layer Rules (enforced by architecture and code review)

```
api/ → may import from: application/, core/
application/ → may import from: domain/, infrastructure/, core/
agents/ → may import from: domain/, infrastructure/, core/
domain/ → may import from: (nothing — pure Python only)
infrastructure/ → may import from: domain/, core/
core/ → may import from: (nothing outside core/)
```

Violations of these import rules are architecture violations — not style issues.

## Entry Point

`main.py` — the `create_app()` factory function. Mounts all routers, registers middleware, and sets up startup/shutdown lifecycle hooks.
