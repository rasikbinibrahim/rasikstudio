let currentWorkspaceRoot: string | null = null

export function getWorkspaceRoot(): string | null {
  return currentWorkspaceRoot
}

export function setWorkspaceRoot(root: string | null): void {
  currentWorkspaceRoot = root
}
