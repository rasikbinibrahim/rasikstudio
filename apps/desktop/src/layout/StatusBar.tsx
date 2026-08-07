import { GitBranch } from 'lucide-react'
import { useAppStore } from '../store'

export function StatusBar(): JSX.Element {
  const workspaceName = useAppStore((state) => state.workspaceName)
  const activeFileId = useAppStore((state) => state.activeFileId)
  const openFiles = useAppStore((state) => state.openFiles)
  const cursorPosition = useAppStore((state) => state.cursorPosition)
  const user = useAppStore((state) => state.user)
  const authRestoring = useAppStore((state) => state.authRestoring)
  const signOut = useAppStore((state) => state.signOut)
  const openAuthDialog = useAppStore((state) => state.openAuthDialog)
  const gitBranch = useAppStore((state) => state.gitStatus?.branch)
  const setSidebarView = useAppStore((state) => state.setSidebarView)

  const activeFile = openFiles.find((f) => f.id === activeFileId) ?? null

  return (
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-border-subtle bg-bg-active px-3 text-xs text-text-inverse">
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate">{workspaceName ?? 'No folder opened'}</span>
        {gitBranch && (
          <button
            type="button"
            onClick={() => setSidebarView('git')}
            className="flex shrink-0 items-center gap-1 hover:underline"
          >
            <GitBranch size={12} />
            {gitBranch}
          </button>
        )}
      </div>
      <div className="flex items-center gap-4">
        {activeFile && <span className="truncate">{activeFile.path}</span>}
        {cursorPosition && (
          <span>
            Ln {cursorPosition.line}, Col {cursorPosition.column}
          </span>
        )}
        <button
          type="button"
          className="truncate hover:underline disabled:no-underline disabled:opacity-70"
          disabled={authRestoring}
          onClick={() => (user ? signOut() : openAuthDialog())}
        >
          {authRestoring ? 'Signing in…' : user ? `Signed in as ${user.email}` : 'Sign In'}
        </button>
      </div>
    </div>
  )
}
