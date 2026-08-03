# apps/desktop/src/layout/

IDE chrome components — the structural scaffolding that holds all panels together. These components define the visual frame of the application, not the content inside it.

## Files (to be created in Phase 3)

| File | Description |
|---|---|
| `IDELayout.tsx` | Root layout — composes all regions using react-resizable-panels |
| `ActivityBar.tsx` | 48px left edge bar with icon buttons for each panel |
| `LeftSidebar.tsx` | Resizable left panel — file explorer, git, docker, extensions |
| `RightSidebar.tsx` | Collapsible right panel — AI chat, agent panel |
| `EditorArea.tsx` | Center region containing editor tabs and Monaco |
| `BottomPanel.tsx` | Collapsible bottom panel — terminal, problems, output |
| `StatusBar.tsx` | Fixed 24px bar at bottom — branch, language, line:col, AI status |
| `ResizablePanel.tsx` | Wrapper around `react-resizable-panels` with Rasik Studio styling |
| `PanelTab.tsx` | Tab bar for switching between panels in a region |

## Rules

- Layout components do not own business state — they read UI state from `store/ui-slice.ts`.
- Layout components do not import from `features/` — they render feature components passed as children or via slot props.
- Panel sizes are persisted in user settings, not in component state.
