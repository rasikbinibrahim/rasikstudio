# Phase 12 — Git Integration

**Part of:** [Implementation Roadmap](README.md)
**Depends on:** Phase 3, Phase 4
**Estimated effort:** 2 weeks

---

## Objective

Build Git integration using the Git CLI subprocess: status panel, staging, committing, diff viewer, AI-generated commit messages, and basic conflict resolution UI. By the end of this phase, a user can manage all common Git operations without leaving the IDE.

## Architecture

**Implementation:** Git CLI subprocess via `execFile` (not libgit2 — see ADR 0008). All Git commands run in the Electron main process via IPC.

**GitService (Electron main):**
- `status()` — `git status --porcelain=v2`
- `stage(paths)` — `git add -- <paths>`
- `unstage(paths)` — `git restore --staged <paths>`
- `commit(message)` — `git commit -m <message>`
- `diff(staged, filePath)` — `git diff [--staged] -- <filePath>`
- `log(limit, branch)` — `git log --oneline -n <limit>`
- `branches()` — `git branch --all --format=...`
- `checkout(branch)` — `git checkout <branch>`
- `push()`, `pull()` — with output streaming
- `generateCommitMessage(diff)` — calls AI via backend

**Git status panel UI:**
- 3 sections: Staged, Unstaged, Untracked
- Click a file → opens Monaco diff editor (original vs. working copy)
- Checkbox to stage/unstage individual files or hunks
- Commit message text area + Generate (AI) button
- Inline conflict markers highlighted in diff view

## Dependencies

- Phase 3 complete (Electron main process, IPC registry)
- Phase 9 complete (AI commit message generation via backend)
- Phase 4 backend (AI endpoint for commit message)
- Git CLI available in PATH (system dependency)

## Files to Create

**Electron main:**
- `electron/main/git-service.ts` — `GitService` class with all Git operations
- `electron/main/ipc/git-handlers.ts` — IPC handlers

**Desktop renderer:**
- `src/features/git/GitPanel.tsx` — main Git panel
- `src/features/git/GitStatusSection.tsx` — staged/unstaged/untracked lists
- `src/features/git/GitFileItem.tsx` — single file row with stage/unstage toggle
- `src/features/git/CommitPanel.tsx` — message input, AI generate button, commit button
- `src/features/git/DiffViewer.tsx` — Monaco diff editor wrapper
- `src/features/git/ConflictResolver.tsx` — 3-way merge conflict UI
- `src/store/git-slice.ts`

**Backend (AI commit message):**
- `app/api/v1/git.py` — `POST /git/generate-commit-message` endpoint

## Files to Modify

- `electron/preload/index.ts` — expose `window.rasik.git.*`
- `src/layout/LeftSidebar.tsx` — mount GitPanel in sidebar
- `src/layout/StatusBar.tsx` — show current branch and sync status

## Acceptance Criteria

- [ ] Git status panel correctly categorizes files as staged/unstaged/untracked
- [ ] Staging a file moves it to the Staged section
- [ ] Clicking a file in the diff panel opens Monaco diff editor with correct before/after
- [ ] AI commit message generation sends the staged diff to the backend and inserts the result
- [ ] `git commit` creates a real commit (verify with `git log`)
- [ ] Status bar shows current branch name
- [ ] `Ctrl+Shift+G` focuses the Git panel
- [ ] File tree shows git decorations (modified: orange, added: green, untracked: teal)
- [ ] Conflict markers in a conflicted file are highlighted in the editor
- [ ] All IPC handlers validate that paths are within the workspace root

## Testing Strategy

- **Unit tests:** GitService output parsing (porcelain format), status categorization
- **Integration tests (manual):** Stage, commit, check `git log` in a real test repository

## Estimated Effort

**2 weeks**
- Week 1: GitService, all IPC handlers, status panel UI
- Week 2: Diff viewer, conflict resolver, AI commit message, status bar decorations
