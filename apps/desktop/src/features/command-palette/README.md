# apps/desktop/src/features/command-palette/

Global command palette triggered by `Ctrl+Shift+P`. Fuzzy searches all registered commands and recently used files, and dispatches selected commands.

## Files (to be created in Phase 3)

| File | Purpose |
|---|---|
| `CommandPalette.tsx` | Modal overlay with search input and filtered result list |
| `CommandRegistry.ts` | Singleton registry — features register their commands on mount |
| `useCommandPalette.ts` | Hook for opening/closing palette, managing keyboard navigation |
| `command-types.ts` | `Command` interface: `id`, `label`, `description`, `keybinding`, `handler` |

## Command Registration Pattern

Features register commands on component mount:

```ts
CommandRegistry.register({
  id: 'git.stage-all',
  label: 'Git: Stage All Changes',
  handler: () => dispatch(gitActions.stageAll()),
});
```

Plugins also contribute commands through the plugin API, which calls the same registry.

## Search Algorithm

Fuzzy matching with recency boost — recently used commands appear higher in results. The palette also shows quick-open file results when the input starts with a file path character.
