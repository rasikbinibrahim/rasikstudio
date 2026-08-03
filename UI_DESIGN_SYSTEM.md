# UI Design System — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03

---

## 1. Overview

The Rasik Studio design system defines the visual language, component library, and interaction patterns used throughout the IDE. It is implemented with Tailwind CSS and a set of base React components. All UI in the application must use these components — no ad-hoc inline styles for structural elements.

---

## 2. Design Principles

1. **Focused** — Every element serves a purpose. No decorative chrome.
2. **Dense but readable** — IDEs require high information density. Spacing is compact but not cramped.
3. **Consistent** — Same patterns everywhere. No surprises.
4. **Keyboard-first** — Every interaction reachable without a mouse.
5. **Theme-aware** — Dark mode is the default; light mode is fully supported.

---

## 3. Color System

### 3.1 Semantic Tokens

Colors are defined as semantic tokens, not raw hex values. Components use tokens, not hex.

```css
/* Dark theme (default) */
:root[data-theme="dark"] {
  /* Surface */
  --color-bg-base:         #1e1e1e;   /* Main editor background */
  --color-bg-panel:        #252526;   /* Sidebar, panel backgrounds */
  --color-bg-elevated:     #2d2d30;   /* Dropdowns, tooltips */
  --color-bg-overlay:      #383838;   /* Hover states */
  --color-bg-active:       #094771;   /* Selected item background */
  --color-bg-input:        #3c3c3c;   /* Input fields */

  /* Border */
  --color-border-subtle:   #333333;   /* Dividers */
  --color-border-default:  #474747;   /* Input borders */
  --color-border-focus:    #007fd4;   /* Focused input */

  /* Text */
  --color-text-primary:    #cccccc;   /* Main text */
  --color-text-secondary:  #858585;   /* Muted/secondary text */
  --color-text-disabled:   #5a5a5a;   /* Disabled text */
  --color-text-inverse:    #ffffff;   /* Text on dark backgrounds */
  --color-text-link:       #3794ff;   /* Links */

  /* Accent */
  --color-accent-primary:  #007acc;   /* Primary actions (buttons, focus) */
  --color-accent-hover:    #1a8ed0;
  --color-accent-muted:    #094771;   /* Subtle accent backgrounds */

  /* Status */
  --color-status-success:  #89d185;
  --color-status-warning:  #cca700;
  --color-status-error:    #f48771;
  --color-status-info:     #75beff;

  /* Git decorations */
  --color-git-modified:    #e2c08d;
  --color-git-added:       #81b88b;
  --color-git-deleted:     #c74e39;
  --color-git-untracked:   #73c991;
  --color-git-conflict:    #e4676b;
}

/* Light theme */
:root[data-theme="light"] {
  --color-bg-base:         #ffffff;
  --color-bg-panel:        #f3f3f3;
  --color-bg-elevated:     #f8f8f8;
  --color-bg-overlay:      #e8e8e8;
  --color-bg-active:       #0060c0;
  --color-bg-input:        #ffffff;
  --color-border-subtle:   #e5e5e5;
  --color-border-default:  #cecece;
  --color-border-focus:    #0078d4;
  --color-text-primary:    #3b3b3b;
  --color-text-secondary:  #717171;
  --color-text-disabled:   #a5a5a5;
  --color-text-inverse:    #ffffff;
  --color-text-link:       #006ab1;
  --color-accent-primary:  #0078d4;
  --color-accent-hover:    #106ebe;
  --color-accent-muted:    #cce4f7;
  --color-status-success:  #388a34;
  --color-status-warning:  #795e00;
  --color-status-error:    #be1100;
  --color-status-info:     #005fb8;
  --color-git-modified:    #895503;
  --color-git-added:       #587c0c;
  --color-git-deleted:     #ad0707;
  --color-git-untracked:   #007526;
  --color-git-conflict:    #ad0707;
}
```

### 3.2 Tailwind Mapping

Tailwind CSS is configured to use these tokens:

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        bg: {
          base: 'var(--color-bg-base)',
          panel: 'var(--color-bg-panel)',
          elevated: 'var(--color-bg-elevated)',
          overlay: 'var(--color-bg-overlay)',
          active: 'var(--color-bg-active)',
          input: 'var(--color-bg-input)',
        },
        border: {
          subtle: 'var(--color-border-subtle)',
          default: 'var(--color-border-default)',
          focus: 'var(--color-border-focus)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          disabled: 'var(--color-text-disabled)',
          link: 'var(--color-text-link)',
        },
        accent: {
          primary: 'var(--color-accent-primary)',
          hover: 'var(--color-accent-hover)',
          muted: 'var(--color-accent-muted)',
        },
        status: {
          success: 'var(--color-status-success)',
          warning: 'var(--color-status-warning)',
          error: 'var(--color-status-error)',
          info: 'var(--color-status-info)',
        },
      },
    },
  },
};
```

---

## 4. Typography

```css
/* Base fonts */
--font-ui:   'Inter', 'Segoe UI', system-ui, sans-serif;     /* UI text */
--font-mono: 'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace; /* Code */

/* Scale */
--text-xs:   11px;   /* Status bar, secondary labels */
--text-sm:   12px;   /* Sidebar items, panel headers */
--text-base: 13px;   /* Default UI text */
--text-md:   14px;   /* Larger body text, descriptions */
--text-lg:   16px;   /* Section headings */
--text-xl:   18px;   /* Modal titles */

/* Line heights */
--leading-tight:  1.2;
--leading-normal: 1.4;
--leading-relaxed: 1.6;  /* For markdown/documentation views */
```

---

## 5. Spacing Scale

```
0  →  0px
1  →  2px
2  →  4px
3  →  6px
4  →  8px
5  →  10px
6  →  12px
8  →  16px
10 →  20px
12 →  24px
16 →  32px
```

Panel padding: `p-2` (8px). List item padding: `px-3 py-1` (12px / 4px).

---

## 6. Component Library

### 6.1 Button

```typescript
// components/ui/Button.tsx
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  size: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  onClick?: () => void;
  children: React.ReactNode;
}
```

Visual specs:
- `primary`: `bg-accent-primary text-white hover:bg-accent-hover` — main CTA
- `secondary`: `bg-bg-elevated border border-border-default` — secondary actions
- `ghost`: `bg-transparent hover:bg-bg-overlay` — toolbar/icon buttons
- `danger`: `bg-status-error text-white` — destructive actions

### 6.2 Input

```typescript
interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  prefix?: React.ReactNode;   // icon or text before input
  suffix?: React.ReactNode;   // icon or text after input
}
```

Focus ring: `ring-2 ring-accent-primary ring-offset-0`.

### 6.3 Tooltip

```typescript
interface TooltipProps {
  content: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;   // ms before showing (default 500ms)
  children: React.ReactNode;
}
```

Implemented with Radix UI `@radix-ui/react-tooltip`.

### 6.4 Modal / Dialog

```typescript
interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
}
```

- Focus trapped inside modal when open.
- Closed with `Escape` key.
- Background overlay: `bg-black/60`.

### 6.5 ScrollArea

Custom scroll area (replaces native scrollbar):

```typescript
// Thin, theme-colored scrollbar
// Uses CSS scrollbar-width: thin; scrollbar-color: var(--color-border-default) transparent;
```

### 6.6 Tabs

```typescript
interface TabsProps {
  tabs: { id: string; label: string; icon?: React.ReactNode; closeable?: boolean }[];
  activeId: string;
  onTabChange: (id: string) => void;
  onTabClose?: (id: string) => void;
}
```

Used for: editor tabs, terminal tabs, chat session tabs.

---

## 7. Icon System

Icons use `lucide-react` for all UI icons (consistent weight, style):

```typescript
import { FileCode, GitBranch, Terminal, Bot, Settings } from 'lucide-react';
```

Activity bar icons use SVG with `width={24} height={24} stroke-width={1.5}`.
Sidebar and inline icons use `width={16} height={16} stroke-width={2}`.

File icons (in the file explorer) use the `seti` icon pack, mapped by file extension.

---

## 8. Layout Components

### 8.1 ActivityBar

```typescript
// Left edge: vertical bar with icon buttons for each panel
interface ActivityBarItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;    // notification count
  active?: boolean;
}
```

Width: 48px. Icon size: 24px.

### 8.2 Panel

```typescript
// Generic resizable panel
interface PanelProps {
  defaultSize: number;      // percentage
  minSize?: number;
  maxSize?: number;
  position: 'left' | 'right' | 'bottom';
  collapsible?: boolean;
  children: React.ReactNode;
}
```

Implemented with `react-resizable-panels`.

### 8.3 StatusBar

Fixed 24px bar at the bottom. Sections:
- Left: Git branch, sync status
- Right: Language mode, line:col, encoding, EOL, AI status indicator

---

## 9. Motion and Animation

Animations are subtle and functional — never decorative:

| Element | Animation | Duration |
|---|---|---|
| Panel resize | None (instant) | — |
| Modal open/close | Fade + scale | 120ms |
| Tooltip show | Fade in | 80ms |
| Sidebar panel switch | Fade | 80ms |
| Streaming text | None (append instantly) | — |
| Toast notification | Slide from bottom | 150ms |
| Tab close | Collapse width | 100ms |

`prefers-reduced-motion`: all animations disabled when the user prefers reduced motion.

---

## 10. Keyboard Navigation

| Shortcut | Action |
|---|---|
| `Ctrl+P` | Quick open file |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+`` ` | Toggle terminal |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+Shift+E` | Focus file explorer |
| `Ctrl+Shift+G` | Focus Git panel |
| `Ctrl+Shift+C` | Focus AI chat |
| `Ctrl+W` | Close active tab |
| `Ctrl+Tab` | Switch tabs |
| `Ctrl+\` | Split editor |
| `Ctrl+K Ctrl+S` | Open keyboard shortcuts |
| `Ctrl+,` | Open settings |

All shortcuts are configurable. Keybinding map is stored in user settings.

---

## 11. Theming

Themes are defined as JSON files:

```json
{
  "name": "Rasik Dark",
  "type": "dark",
  "colors": {
    "--color-bg-base": "#1e1e1e",
    "--color-bg-panel": "#252526",
    ...
  },
  "monacoTheme": {
    "base": "vs-dark",
    "rules": [
      { "token": "comment", "foreground": "6A9955" },
      ...
    ],
    "colors": {
      "editor.background": "#1e1e1e",
      ...
    }
  }
}
```

Themes are loaded and applied by setting `data-theme` on the document root and registering the Monaco theme.

Built-in themes:
- Rasik Dark (default)
- Rasik Light
- High Contrast Dark
- High Contrast Light

Community themes installable as plugins.
