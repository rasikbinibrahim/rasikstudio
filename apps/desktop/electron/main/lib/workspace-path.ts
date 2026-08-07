import { resolve, sep, normalize } from 'node:path'

export class SecurityError extends Error {}

export function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
  const normalized = normalize(relativePath)
  if (normalized.startsWith('..')) {
    throw new SecurityError(`Path traversal attempt: ${relativePath}`)
  }

  const absolute = resolve(workspaceRoot, normalized)

  if (absolute !== resolve(workspaceRoot) && !absolute.startsWith(resolve(workspaceRoot) + sep)) {
    throw new SecurityError(`Path outside workspace: ${relativePath}`)
  }

  return absolute
}
