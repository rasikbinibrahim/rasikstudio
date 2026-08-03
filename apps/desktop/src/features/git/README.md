# apps/desktop/src/features/git/

Git panel: file status, staging, commit, diff viewer, AI commit message generation, branch management, and merge conflict resolution.

## Files (to be created in Phase 12)

| File | Purpose |
|---|---|
| `GitPanel.tsx` | Root panel: status sections + commit area |
| `GitStatusSection.tsx` | Renders one section: Staged, Unstaged, or Untracked |
| `GitFileItem.tsx` | Single file row with stage/unstage toggle and diff open button |
| `CommitPanel.tsx` | Commit message textarea, Generate AI button, Commit button |
| `DiffViewer.tsx` | Thin wrapper around `features/editor/DiffViewer.tsx` for git diffs |
| `ConflictResolver.tsx` | 3-way merge UI for files with conflict markers |
| `BranchSelector.tsx` | Current branch + dropdown to create/switch branches |
| `useGit.ts` | Hook: invokes IPC git handlers, dispatches results to `git-slice.ts` |

## AI Commit Message

1. User clicks "Generate" in `CommitPanel.tsx`
2. `useGit.ts` calls `POST /api/v1/git/generate-commit-message` with the staged diff
3. Backend sends diff to the AI model via `ModelRouter`
4. Response is inserted into the commit message textarea

## Git Decorations

File tree decorations (colored filenames, badges) are driven by `store/git-slice.ts`. The Git panel writes to the slice; the `file-explorer/` feature reads from it.
