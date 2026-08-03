# apps/desktop/src/lib/

Pure utility functions. Zero React dependencies. Zero browser side effects. Zero imports from `store/`, `services/`, or `features/`.

## Acceptable Contents

- String manipulation helpers
- Date formatting
- Path normalization
- Syntax detection by file extension
- Token counting approximations
- Deep-equality checks
- Debounce / throttle implementations (non-hook versions)
- Type guard functions

## Files (to be created as needed)

| File | Purpose |
|---|---|
| `path-utils.ts` | File path manipulation and normalization |
| `file-type.ts` | Detect language / icon from file extension |
| `format.ts` | Date, size, duration formatting |
| `text.ts` | String truncation, ellipsis, word wrap |
| `cn.ts` | `clsx` + `tailwind-merge` utility for className composition |

## The Enforced Rule

If a function in this directory uses `useState`, `useEffect`, `window`, `document`, or any module from `services/` or `store/`, it does not belong here. Move it to `hooks/` or the relevant feature.
