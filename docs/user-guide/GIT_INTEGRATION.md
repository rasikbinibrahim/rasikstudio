# Git Integration

`Ctrl+Shift+G` (or the Activity Bar's Source Control icon) opens the Git panel. It operates on
whatever git repository your open workspace folder is inside — Rasik Studio doesn't manage
repositories itself, it drives the real `git` CLI already installed on your machine (see ADR 0008).

## Status and staging

Changed files are grouped into **Staged**, **Unstaged**, and **Untracked**, each with the file's
status letter (modified/added/deleted/renamed). Click `+`/`−` next to a file to stage/unstage it,
or "Stage All" for a whole section. Click any file to open a real Monaco diff view comparing the
committed version against the staged or working-tree version.

## Committing

Type a message in the commit box and click **Commit**. Click **Generate** first to have AI write
a commit message from your staged diff (needs a configured model — see `AI_FEATURES.md`).

## Branches

Click the branch name (top of the panel, next to the branch icon) to open a picker listing every
local and remote branch, current one highlighted. Click any other branch to check it out.

## History

Click **History** to see a real commit log (hash + message) for the current branch. Click
**Back** to return to the status view.

## Push / Pull

**Push**/**Pull** buttons in the panel header run the real `git push`/`git pull` against your
configured remote and show the real output (including real error messages — a rejected push
shows git's actual rejection reason, not a generic failure).

## Merge conflicts

If a file has real conflict markers, Rasik Studio automatically shows a dedicated conflict
resolver instead of the normal status view: each conflicting block gets Accept Current / Accept
Incoming / Accept Both actions. Not inline editor decorations — a separate panel, by design.

## What isn't built yet

Branch creation/deletion/rename, stash, fetch (as distinct from pull), and a graphical commit
history/branch graph aren't in this panel. Everything above is real and exercised by an automated
test suite (including a real Playwright end-to-end test that stages, commits, and verifies the
result with a real `git log`) — not a design sketch.
