# Plugin Distribution

> Planned design — see `GETTING_STARTED.md`'s banner. Mirrors `PLUGIN_SYSTEM.md` §10 exactly.

## Phase 1 (local install only)

- Install from a local `.zip` file.
- Install from a GitHub release URL.

No hosted registry in this first stage — a plugin author distributes their own `.zip`/release,
and a user installs it by pointing Rasik Studio at it directly.

## Phase 2 (marketplace)

- A hosted plugin registry (a JSON manifest index, the same shape philosophy as `npm`'s own
  registry, just far smaller in scope).
- Plugins signed with the author's key; the signature is verified before install (see
  `SANDBOX.md`'s checksum-verification note — signing and checksum verification work together:
  the signature proves who published it, the checksum proves it hasn't been tampered with since).
- Ratings, reviews, install counts.

Neither phase is built. `docs/user-guide/PLUGINS.md` is the honest, user-facing statement of that;
this file exists so a plugin author planning ahead knows the intended shape without needing to
read the full `PLUGIN_SYSTEM.md` architecture doc.

## Directory layout (design)

```
~/.rasik-studio/
└── plugins/
    ├── com.example.my-plugin/
    │   ├── rasik-plugin.json
    │   ├── dist/
    │   │   └── index.js
    │   └── assets/
    │       └── icon.svg
    └── ...
```

## A note on "built-in plugins"

`PLUGIN_SYSTEM.md` §11 describes the file explorer, git panel, terminal, Docker panel, and search
as eventually being restructured as non-removable "built-in plugins" using this same
architecture. **As of Phase 17, none of them actually are** — every one of those features is a
normal React component in `apps/desktop/src/features/`, not built on a plugin runtime that
doesn't exist yet. That section of `PLUGIN_SYSTEM.md` describes a future refactor, not the
current implementation — noted here so this doc doesn't imply otherwise.
