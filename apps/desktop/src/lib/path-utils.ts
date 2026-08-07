/** Returns the final path segment (file or folder name) from a forward- or backslash-separated path. */
export function basename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path
}

/** Returns the parent directory of a workspace-relative path, or `''` for the workspace root. */
export function dirname(path: string): string {
  const segments = path.split(/[/\\]/).filter(Boolean)
  return segments.slice(0, -1).join('/')
}

/** Joins a parent directory (possibly `''` for the workspace root) and a name into a
 *  workspace-relative path — the inverse of `dirname` + `basename`. */
export function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}
