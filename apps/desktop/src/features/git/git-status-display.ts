import type { GitChangeType, GitStatusResult } from '../../types/git'

/** Single-letter decoration + color per `phase-12-git-integration.md`'s "File tree shows git
 *  decorations (modified: orange, added: green, untracked: teal)" acceptance criterion — the
 *  design system (`tailwind.config.js`) has no dedicated "teal" token, so untracked uses
 *  `accent-primary` (the closest existing color meant to draw attention without implying
 *  success/warning/error, which untracked isn't any of) rather than inventing a new token for one
 *  callsite. */
export const STATUS_LETTER: Record<GitChangeType, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  untracked: 'U',
  conflicted: '!',
}

export const STATUS_COLOR_CLASS: Record<GitChangeType, string> = {
  modified: 'text-status-warning',
  added: 'text-status-success',
  deleted: 'text-status-error',
  renamed: 'text-status-info',
  copied: 'text-status-info',
  untracked: 'text-accent-primary',
  conflicted: 'text-status-error',
}

// Priority when a path could be described multiple ways at once (e.g. staged AND further
// modified since staging): conflicted always wins (needs attention first), then whatever's
// visible in the working tree (what a save/build would actually see), then untracked, then
// staged-only. Matches the general convention VS Code's own file-tree decorations use.
function firstMatch(status: GitStatusResult, path: string): GitChangeType | null {
  const conflicted = status.conflicted.find((entry) => entry.path === path)
  if (conflicted) return 'conflicted'
  const unstaged = status.unstaged.find((entry) => entry.path === path)
  if (unstaged) return unstaged.status
  const untracked = status.untracked.find((entry) => entry.path === path)
  if (untracked) return 'untracked'
  const staged = status.staged.find((entry) => entry.path === path)
  if (staged) return staged.status
  return null
}

/** `phase-12-git-integration.md`'s "File tree shows git decorations" acceptance criterion — a
 *  file gets its own status; a directory gets the "most urgent" status among its descendants
 *  (conflicted > unstaged > untracked > staged, `firstMatch`'s own priority order applied across
 *  every entry under it) so a collapsed folder still hints that something inside changed. */
export function getGitDecorationForPath(
  status: GitStatusResult | null,
  path: string,
  isDirectory: boolean,
): GitChangeType | null {
  if (!status) return null

  if (!isDirectory) return firstMatch(status, path)

  const prefix = `${path}/`
  const allEntries = [...status.conflicted, ...status.unstaged, ...status.untracked, ...status.staged]
  const descendants = allEntries.filter((entry) => entry.path.startsWith(prefix))
  if (descendants.length === 0) return null

  if (status.conflicted.some((entry) => entry.path.startsWith(prefix))) return 'conflicted'
  const unstagedDescendant = status.unstaged.find((entry) => entry.path.startsWith(prefix))
  if (unstagedDescendant) return unstagedDescendant.status
  if (status.untracked.some((entry) => entry.path.startsWith(prefix))) return 'untracked'
  const stagedDescendant = status.staged.find((entry) => entry.path.startsWith(prefix))
  return stagedDescendant ? stagedDescendant.status : null
}
