# apps/desktop/tests/unit/hooks/

Unit tests for shared custom hooks in `src/hooks/`.

Key scenarios to cover per hook:
- `useWebSocket`: subscribes to events, cleans up listener on unmount
- `useIpc`: invokes the correct `window.rasik.*` channel, returns typed result
- `useSettings`: reads effective value considering all four layers
- `useKeyBinding`: registers shortcut on mount, deregisters on unmount
- `useDebounce`: delays value update by the specified milliseconds
