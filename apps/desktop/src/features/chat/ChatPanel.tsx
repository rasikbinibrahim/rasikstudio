import { useEffect } from 'react'
import { useAppStore } from '../../store'
import { EmptyState } from '../../components/ui/EmptyState'
import { ChatSessionList } from './ChatSessionList'
import { ChatMessageList } from './ChatMessageList'
import { ChatInput } from './ChatInput'

export function ChatPanel(): JSX.Element {
  const user = useAppStore((state) => state.user)
  const backendWorkspaceId = useAppStore((state) => state.backendWorkspaceId)
  const workspaceRoot = useAppStore((state) => state.workspaceRoot)
  const openAuthDialog = useAppStore((state) => state.openAuthDialog)
  const loadChatSessions = useAppStore((state) => state.loadChatSessions)
  const chatSessions = useAppStore((state) => state.chatSessions)
  const activeChatSessionId = useAppStore((state) => state.activeChatSessionId)
  const chatMessagesBySession = useAppStore((state) => state.chatMessagesBySession)
  const chatError = useAppStore((state) => state.chatError)

  useEffect(() => {
    if (user && backendWorkspaceId) void loadChatSessions()
  }, [user, backendWorkspaceId, loadChatSessions])

  if (!workspaceRoot) {
    return (
      <EmptyState message="Open a folder first — chat is scoped to a workspace so the assistant knows what it's looking at." />
    )
  }

  if (!user) {
    return (
      <EmptyState message="Sign in to use AI chat.">
        <button type="button" onClick={openAuthDialog} className="text-xs text-accent-primary hover:underline">
          Sign In
        </button>
      </EmptyState>
    )
  }

  if (!backendWorkspaceId) {
    return (
      <EmptyState message="Connecting this workspace to the backend… if this doesn't resolve, check that the backend is running." />
    )
  }

  const activeMessages = activeChatSessionId ? (chatMessagesBySession[activeChatSessionId] ?? []) : []

  return (
    <div className="flex h-full flex-col">
      <ChatSessionList />
      {chatError && <div className="px-3 py-1 text-xs text-status-error">{chatError}</div>}
      {chatSessions.length === 0 ? (
        <EmptyState message="Start a new chat to ask the assistant about this workspace." />
      ) : activeChatSessionId ? (
        <>
          <ChatMessageList messages={activeMessages} />
          <ChatInput />
        </>
      ) : (
        <EmptyState message="Select a chat session above." />
      )}
    </div>
  )
}
