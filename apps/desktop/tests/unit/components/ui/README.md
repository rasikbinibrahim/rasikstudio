# apps/desktop/tests/unit/components/ui/

Unit tests for every design system primitive in `src/components/ui/`.

## Coverage Requirement

100% of all component variants and states must have tests:
- Every `variant` prop value (primary, secondary, ghost, danger)
- Every `size` prop value (sm, md, lg)
- Disabled state renders correctly and does not fire onClick
- Loading state shows spinner, disables interaction
- Keyboard navigation (Tab, Enter, Escape, Arrow keys)
- ARIA attributes are correct

## Test File Naming

```
src/components/ui/Button.tsx  →  tests/unit/components/ui/Button.test.tsx
src/components/ui/Input.tsx   →  tests/unit/components/ui/Input.test.tsx
```
