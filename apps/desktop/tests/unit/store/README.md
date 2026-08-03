# apps/desktop/tests/unit/store/

Unit tests for Zustand state slices in `src/store/`.

Test each slice in isolation: dispatch an action, assert the resulting state. No React rendering needed for these tests.

## Pattern

```ts
import { useStore } from '../../src/store'

test('adds message to chat slice', () => {
  const { addMessage } = useStore.getState()
  addMessage({ role: 'user', content: 'Hello' })
  expect(useStore.getState().messages).toHaveLength(1)
})
```

## Slices to Test

- `workspace-slice`: open, close, set workspace metadata
- `editor-slice`: open file, close tab, mark dirty, clear dirty on save
- `chat-slice`: add session, add message, append stream chunk, complete stream
- `agent-slice`: create task, add step, update status, set approval pending
- `ui-slice`: toggle panels, resize, set active sidebar item
- `settings-slice`: load settings, override a value, reset to default
