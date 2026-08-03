# apps/desktop/src/components/

Shared, reusable React components. These components are feature-agnostic — they carry no business logic and no knowledge of any specific IDE feature.

## Subdirectories

| Directory | Contents |
|---|---|
| `ui/` | Design system primitives: Button, Input, Tooltip, Dialog, ScrollArea, Tabs, etc. |

## What Goes Here

Only components that are genuinely shared across two or more features. If a component is used in only one feature, it lives in `features/<feature>/` instead.

## What Does NOT Go Here

- Feature-specific components (those belong in `features/<feature>/`)
- Components that import from `store/` or `services/` (those are feature components)
- Layout components (those belong in `layout/`)
