# apps/desktop/src/components/ui/

Design system primitives. Every component here is:
- Stateless (no Zustand, no `useEffect` side effects)
- Theme-aware (uses CSS custom property tokens, never raw hex colors)
- Accessible (WCAG 2.1 AA — keyboard navigable, correct ARIA roles)
- Documented with the prop interface in the file header

## Components (to be created in Phase 3)

| File | Description | Variant/Size Options |
|---|---|---|
| `Button.tsx` | Push button | `primary`, `secondary`, `ghost`, `danger` × `sm`, `md`, `lg` |
| `Input.tsx` | Text input with optional prefix/suffix | — |
| `Tooltip.tsx` | Hover tooltip (Radix UI) | `top`, `bottom`, `left`, `right` |
| `Dialog.tsx` | Modal dialog with focus trap (Radix UI) | `sm`, `md`, `lg`, `full` |
| `ScrollArea.tsx` | Custom thin scrollbar | — |
| `Tabs.tsx` | Closeable tab bar | — |
| `Badge.tsx` | Numeric notification badge | `default`, `error` |
| `ContextMenu.tsx` | Right-click context menu (Radix UI) | — |
| `index.ts` | Barrel export for all components | — |

## Token Rule

All colors, spacing, and typography must reference CSS custom properties defined in `styles/global.css`. Never use raw hex, rgb, or Tailwind palette colors directly.
