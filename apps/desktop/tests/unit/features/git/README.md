# apps/desktop/tests/unit/features/git/

Unit tests for the git panel.

Key scenarios to cover:
- Files are correctly categorized into Staged, Unstaged, Untracked sections
- Staging a file calls the correct IPC handler and updates the store
- AI commit message generation inserts text into the commit message textarea
- Clicking a file opens the diff viewer
- Conflict markers in diff view are highlighted
