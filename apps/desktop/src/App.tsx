import { lazy, Suspense, useEffect } from 'react'
import { IDELayout } from './layout/IDELayout'
import { FileExplorer } from './features/file-explorer/FileExplorer'
import { EditorTabBar } from './features/editor/EditorTabBar'
import { MonacoEditor } from './features/editor/MonacoEditor'
import { CommandPalette } from './features/command-palette/CommandPalette'
import { commandRegistry } from './features/command-palette/CommandRegistry'
import { useCommandPalette } from './features/command-palette/useCommandPalette'
import { useKeyBinding } from './hooks/useKeyBinding'
import { useTheme } from './hooks/useTheme'
import { useAiEventBridge } from './hooks/useAiEventBridge'
import { useAppStore } from './store'

// xterm.js + its addons are ~700KB — lazy-loaded so they're not part of the initial bundle,
// matching how MonacoEditor lazy-loads monaco-editor and PERFORMANCE_GUIDE.md §7's guidance
// to lazy-load heavy panels. Only fetched once the terminal panel is actually rendered.
const TerminalPanel = lazy(() =>
  import('./features/terminal/TerminalPanel').then((module) => ({ default: module.TerminalPanel })),
)

// react-markdown + rehype-highlight + @tanstack/react-virtual (ChatPanel) and the step-timeline
// rendering (AgentPanel) are both sidebar views a session may never open — same lazy-loading
// rationale as TerminalPanel above, now covering Phase 10's and Phase 8's desktop UI.
const ChatPanel = lazy(() =>
  import('./features/chat/ChatPanel').then((module) => ({ default: module.ChatPanel })),
)
const AgentPanel = lazy(() =>
  import('./features/agent/AgentPanel').then((module) => ({ default: module.AgentPanel })),
)
const GitPanel = lazy(() =>
  import('./features/git/GitPanel').then((module) => ({ default: module.GitPanel })),
)
const BrowserPanel = lazy(() =>
  import('./features/browser/BrowserPanel').then((module) => ({ default: module.BrowserPanel })),
)
const DockerPanel = lazy(() =>
  import('./features/docker/DockerPanel').then((module) => ({ default: module.DockerPanel })),
)

// Neither is needed for first paint — Settings opens only on Ctrl+, /an explicit command, and
// AuthDialog only on an explicit sign-in action — so both are lazy for the same initial-bundle-
// size reason as the panels above (Phase 18's <500KB NFR target), not because either is large on
// its own.
const Settings = lazy(() =>
  import('./features/settings/Settings').then((module) => ({ default: module.Settings })),
)
const AuthDialog = lazy(() =>
  import('./features/auth/AuthDialog').then((module) => ({ default: module.AuthDialog })),
)

/** Ctrl+` both shows the terminal panel and, if it was empty, starts a first shell — matching
 *  the common IDE convention where the toggle key also guarantees there's something to see. */
function toggleTerminalPanel(): void {
  const { bottomPanelCollapsed, toggleBottomPanel, terminals, createTerminal } = useAppStore.getState()
  const willBecomeVisible = bottomPanelCollapsed
  toggleBottomPanel()
  if (willBecomeVisible && terminals.length === 0) {
    void createTerminal()
  }
}

function focusChatInput(): void {
  useAppStore.getState().setSidebarView('chat')
  // The panel is lazy-loaded and just told to mount — its <textarea id="chat-input"> isn't in
  // the DOM yet this tick, so focusing has to wait one paint rather than running synchronously.
  requestAnimationFrame(() => document.getElementById('chat-input')?.focus())
}

export default function App(): JSX.Element {
  const { open, mode, query, openPalette, closePalette, setQuery } = useCommandPalette()
  const { toggleTheme } = useTheme()
  const authDialogOpen = useAppStore((state) => state.authDialogOpen)
  const closeAuthDialog = useAppStore((state) => state.closeAuthDialog)
  const settingsOpen = useAppStore((state) => state.settingsOpen)
  const closeSettings = useAppStore((state) => state.closeSettings)
  const activeSidebarView = useAppStore((state) => state.activeSidebarView)
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)

  useAiEventBridge()

  // Once, at startup — restores a safeStorage-persisted session (refreshing it if the access
  // token has already expired) before the user does anything. See auth-slice.ts's docstring.
  useEffect(() => {
    void useAppStore.getState().restoreSession()
  }, [])

  // The native app menu (electron/main/app-menu.ts) sends a commandRegistry id for every
  // actionable item — this is the one place that turns those into an actual command run,
  // exactly like a command-palette selection would.
  useEffect(() => {
    return window.rasik.menu.onCommand((commandId) => {
      void commandRegistry.execute(commandId)
    })
  }, [])

  useKeyBinding([
    { key: 'p', ctrlOrCmd: true, handler: () => openPalette('files') },
    { key: 'p', ctrlOrCmd: true, shift: true, handler: () => openPalette('commands') },
    { key: '`', ctrlOrCmd: true, handler: toggleTerminalPanel },
    { key: 'c', ctrlOrCmd: true, shift: true, handler: focusChatInput },
    { key: 'g', ctrlOrCmd: true, shift: true, handler: () => useAppStore.getState().setSidebarView('git') },
    { key: 'b', ctrlOrCmd: true, shift: true, handler: () => useAppStore.getState().setSidebarView('browser') },
    { key: 'd', ctrlOrCmd: true, shift: true, handler: () => useAppStore.getState().setSidebarView('docker') },
    { key: ',', ctrlOrCmd: true, handler: () => useAppStore.getState().openSettings() },
  ])

  // Register the commands available in the palette. Each calls a real store action —
  // none of these are placeholders.
  useEffect(() => {
    const unregisterFns = [
      commandRegistry.register({
        id: 'workspace.openFolder',
        title: 'Open Folder…',
        keybinding: undefined,
        run: () => useAppStore.getState().openFolder(),
      }),
      commandRegistry.register({
        id: 'editor.saveFile',
        title: 'Save File',
        keybinding: 'Ctrl+S',
        run: () => {
          const { activeFileId, saveFile } = useAppStore.getState()
          if (activeFileId) return saveFile(activeFileId)
        },
      }),
      commandRegistry.register({
        id: 'editor.closeTab',
        title: 'Close Tab',
        keybinding: 'Ctrl+W',
        run: () => {
          const { activeFileId, closeFile } = useAppStore.getState()
          if (activeFileId) closeFile(activeFileId)
        },
      }),
      commandRegistry.register({
        id: 'view.toggleTheme',
        title: 'Toggle Theme',
        keybinding: undefined,
        run: () => toggleTheme(),
      }),
      commandRegistry.register({
        id: 'view.toggleTerminal',
        title: 'Toggle Terminal',
        keybinding: 'Ctrl+`',
        run: () => toggleTerminalPanel(),
      }),
      commandRegistry.register({
        id: 'terminal.new',
        title: 'New Terminal',
        keybinding: undefined,
        run: () => useAppStore.getState().createTerminal(),
      }),
      commandRegistry.register({
        id: 'account.signIn',
        title: 'Account: Sign In',
        keybinding: undefined,
        run: () => useAppStore.getState().openAuthDialog(),
      }),
      commandRegistry.register({
        id: 'view.showChat',
        title: 'View: Show AI Chat',
        keybinding: 'Ctrl+Shift+C',
        run: () => focusChatInput(),
      }),
      commandRegistry.register({
        id: 'view.showAgentTasks',
        title: 'View: Show Agent Tasks',
        keybinding: undefined,
        run: () => useAppStore.getState().setSidebarView('agents'),
      }),
      commandRegistry.register({
        id: 'view.showExplorer',
        title: 'View: Show Explorer',
        keybinding: undefined,
        run: () => useAppStore.getState().setSidebarView('explorer'),
      }),
      commandRegistry.register({
        id: 'view.showGit',
        title: 'View: Show Source Control',
        keybinding: 'Ctrl+Shift+G',
        run: () => useAppStore.getState().setSidebarView('git'),
      }),
      commandRegistry.register({
        id: 'view.showBrowser',
        title: 'View: Show Browser',
        keybinding: 'Ctrl+Shift+B',
        run: () => useAppStore.getState().setSidebarView('browser'),
      }),
      commandRegistry.register({
        id: 'view.showDocker',
        title: 'View: Show Docker',
        keybinding: 'Ctrl+Shift+D',
        run: () => useAppStore.getState().setSidebarView('docker'),
      }),
      commandRegistry.register({
        id: 'preferences.openSettings',
        title: 'Preferences: Open Settings',
        keybinding: 'Ctrl+,',
        run: () => useAppStore.getState().openSettings(),
      }),
    ]

    return () => {
      for (const unregister of unregisterFns) unregister()
    }
  }, [toggleTheme])

  return (
    <>
      <IDELayout
        sidebar={
          sidebarCollapsed ? null : activeSidebarView === 'chat' ? (
            <Suspense fallback={null}>
              <ChatPanel />
            </Suspense>
          ) : activeSidebarView === 'agents' ? (
            <Suspense fallback={null}>
              <AgentPanel />
            </Suspense>
          ) : activeSidebarView === 'git' ? (
            <Suspense fallback={null}>
              <GitPanel />
            </Suspense>
          ) : activeSidebarView === 'browser' ? (
            <Suspense fallback={null}>
              <BrowserPanel />
            </Suspense>
          ) : activeSidebarView === 'docker' ? (
            <Suspense fallback={null}>
              <DockerPanel />
            </Suspense>
          ) : (
            <FileExplorer />
          )
        }
        editor={
          <>
            <EditorTabBar />
            <MonacoEditor />
          </>
        }
        bottomPanel={
          <Suspense fallback={null}>
            <TerminalPanel />
          </Suspense>
        }
      />
      <CommandPalette
        open={open}
        mode={mode}
        query={query}
        onQueryChange={setQuery}
        onClose={closePalette}
      />
      {/* Rendered only once actually opened, not just when `open={false}` — `lazy()` still has
          to resolve the import to render a mounted-but-closed component, which would defeat the
          point of deferring these two out of the initial bundle. */}
      {authDialogOpen && (
        <Suspense fallback={null}>
          <AuthDialog open={authDialogOpen} onClose={closeAuthDialog} />
        </Suspense>
      )}
      {settingsOpen && (
        <Suspense fallback={null}>
          <Settings open={settingsOpen} onClose={closeSettings} />
        </Suspense>
      )}
    </>
  )
}
