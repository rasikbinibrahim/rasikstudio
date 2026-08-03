# Git Integration — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03

---

## 1. Overview

Git integration is implemented as a thin wrapper around the Git CLI. This approach avoids the complexity of `libgit2` bindings while leveraging the full power of Git. The integration is exposed through the IPC layer (main process → renderer) and also available to agents through the Tool Registry.

---

## 2. Architecture

```
Git Panel (React)
    │
    ▼
git.store.ts (Zustand)
    │
    ▼
ipc.client.ts  →  IPC  →  git.ipc.ts (Electron main)
                                │
                                ▼
                       GitService (spawns git CLI)
                                │
                                ▼
                         Git executable
```

For backend agent use, the same `GitService` logic is implemented as a Python subprocess wrapper in `app/infrastructure/tools/git_tool.py`.

---

## 3. Features

| Feature | Status |
|---|---|
| View working tree status | Phase 12 |
| Stage / unstage files | Phase 12 |
| Commit | Phase 12 |
| Push / pull | Phase 12 |
| View file diff (Monaco diff editor) | Phase 12 |
| Branch list / checkout / create | Phase 12 |
| View commit log | Phase 12 |
| AI-generated commit messages | Phase 12 |
| Conflict detection | Phase 12 |
| Merge conflict resolution UI | Phase 12+ |
| Git blame (inline annotations) | Phase 12+ |
| Stash management | Phase 12+ |
| Tag management | Phase 12+ |
| Submodule support | Future |

---

## 4. Git Service (Node.js / Electron main)

```typescript
// electron/ipc/git.ipc.ts

class GitService {
  constructor(private readonly repoPath: string) {}

  private async exec(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile('git', args, { cwd: this.repoPath, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) reject(new GitError(stderr || err.message));
        else resolve(stdout.trim());
      });
    });
  }

  async status(): Promise<GitStatus> {
    const raw = await this.exec(['status', '--porcelain=v2', '--branch']);
    return parseGitStatusV2(raw);
  }

  async stage(paths: string[]): Promise<void> {
    await this.exec(['add', '--', ...paths]);
  }

  async unstage(paths: string[]): Promise<void> {
    await this.exec(['restore', '--staged', '--', ...paths]);
  }

  async commit(message: string): Promise<string> {
    await this.exec(['commit', '-m', message]);
    return this.exec(['rev-parse', 'HEAD']);
  }

  async push(remote = 'origin', branch?: string): Promise<void> {
    const args = ['push', remote];
    if (branch) args.push(branch);
    await this.exec(args);
  }

  async pull(remote = 'origin', branch?: string): Promise<void> {
    const args = ['pull', remote];
    if (branch) args.push(branch);
    await this.exec(args);
  }

  async diff(path?: string, staged = false): Promise<string> {
    const args = ['diff'];
    if (staged) args.push('--staged');
    if (path) args.push('--', path);
    return this.exec(args);
  }

  async log(limit = 20, offset = 0): Promise<Commit[]> {
    const format = '%H%n%an%n%ae%n%at%n%s%n%b%n---';
    const raw = await this.exec([
      'log', `--format=${format}`, `--skip=${offset}`, `-n`, `${limit}`
    ]);
    return parseGitLog(raw);
  }

  async branches(): Promise<BranchList> {
    const raw = await this.exec(['branch', '-vva', '--format=%(refname:short)|%(upstream:short)|%(HEAD)']);
    return parseBranches(raw);
  }

  async checkout(branch: string, create = false): Promise<void> {
    const args = create ? ['checkout', '-b', branch] : ['checkout', branch];
    await this.exec(args);
  }
}
```

---

## 5. Git Status Panel (UI)

### Layout

```
┌─────────────────────────────────────────────┐
│ SOURCE CONTROL                          [+] │
├─────────────────────────────────────────────┤
│ Branch: main  ↑2 ↓0                        │
├─────────────────────────────────────────────┤
│ ✏ Generate commit message                   │
│ ┌─────────────────────────────────────────┐ │
│ │ feat: add JWT refresh token rotation    │ │
│ └─────────────────────────────────────────┘ │
│              [Commit]  [Commit & Push]       │
├─────────────────────────────────────────────┤
│ ▼ Staged Changes (2)                        │
│   M src/auth.ts                       [-]   │
│   A src/token.ts                      [-]   │
├─────────────────────────────────────────────┤
│ ▼ Changes (1)                               │
│   M src/index.ts                      [+]   │
├─────────────────────────────────────────────┤
│ ▼ Untracked (1)                             │
│   ? src/new-feature.ts                [+]   │
└─────────────────────────────────────────────┘
```

- Clicking a file opens the Monaco diff editor for that file.
- `[+]` stages a file. `[-]` unstages it.
- `↑2 ↓0` = 2 commits ahead of origin, 0 behind.

---

## 6. Monaco Diff Editor

When a file is clicked in the Git panel, it opens in Monaco's diff editor:

```typescript
import * as monaco from 'monaco-editor';

const diffEditor = monaco.editor.createDiffEditor(container, {
  readOnly: false,          // right side (modified) is editable
  renderSideBySide: true,   // or inline based on panel width
  originalEditable: false,
});

diffEditor.setModel({
  original: monaco.editor.createModel(originalContent, language),
  modified: monaco.editor.createModel(modifiedContent, language),
});
```

Users can edit the modified side directly in the diff view and save.

---

## 7. AI Commit Message Generation

When the user clicks "Generate commit message":

1. Backend runs `git diff --staged` for the workspace.
2. Diff is sent to the AI model with the prompt:
   ```
   Generate a concise, conventional commit message for this diff.
   Use the format: <type>(<scope>): <description>
   Types: feat, fix, docs, style, refactor, test, chore
   Keep the first line under 72 characters.
   Do not add a body unless the change requires explanation.
   
   Diff:
   {diff}
   ```
3. The generated message is pre-filled in the commit message box.
4. User edits if needed and commits.

---

## 8. Commit History View

```
┌─────────────────────────────────────────────────────────────┐
│ COMMIT HISTORY                                              │
├───────────────────────────────────────────────────────────┬─┤
│ feat: add JWT refresh token rotation           abc1234   │ │
│ Alice · 2 hours ago                                      │ │
├───────────────────────────────────────────────────────────┤ │
│ fix: resolve race condition in agent executor  def5678   │ │
│ Alice · 5 hours ago                                      │ │
├───────────────────────────────────────────────────────────┤ │
│ chore: update dependencies                     ghi9012   │ │
│ Bob · 1 day ago                                          │ │
└───────────────────────────────────────────────────────────┴─┘
```

Clicking a commit shows the full diff for that commit in the diff editor.

---

## 9. Merge Conflict Resolution

When conflicts exist, affected files are marked with `C` in the file tree.

Conflict resolution UI:
- Open the conflicted file in a 3-way diff view: **ours** | **merged** | **theirs**.
- User can accept **ours**, accept **theirs**, accept **both**, or edit manually.
- AI can be invoked to suggest the best resolution based on context.
- After resolving all conflicts, the file is auto-staged.

---

## 10. File Decorations in Editor

The Monaco editor shows Git decorations in the gutter:
- Green bar: added line
- Blue bar: modified line
- Red triangle: deleted line(s)

These are computed by comparing the working file content to `HEAD` via `git diff`.

---

## 11. `.gitignore` Awareness

The file explorer and AI context builder both respect `.gitignore`. Files matching ignore patterns are:
- Shown as grayed-out in the file tree (with a toggle to show them).
- Excluded from AI context injection.
- Excluded from RAG indexing.

---

## 12. Security Notes

- All git commands run with the workspace directory as `cwd`.
- Input paths are validated against the workspace root to prevent traversal.
- Credentials (SSH keys, HTTPS tokens) are managed by the OS credential store (`git credential helper`). Rasik Studio does not store Git credentials.
- Push/pull operations that require credentials fail gracefully with a message to configure Git credentials externally.
