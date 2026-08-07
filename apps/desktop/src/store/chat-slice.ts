import type { StateCreator } from 'zustand'
import type { AppStore } from './types'
import type { ActiveFileContext, ChatMessage, ChatSession } from '../types/chat'
// Aliased on import: the slice below exposes actions with the same names (`createChatSession`,
// `deleteChatSession`, `sendChatMessage`) — these are the REST calls those actions wrap, kept
// distinctly named so a reader (and `this`-less closures inside the object literal, which resolve
// bare identifiers from the module scope, not the sibling property) never has to wonder which one
// a given call site means.
import {
  createChatSession as apiCreateChatSession,
  deleteChatSession as apiDeleteChatSession,
  getChatSession as apiGetChatSession,
  listChatSessions as apiListChatSessions,
  sendChatMessage as apiSendChatMessage,
} from '../services/chat-client'

export interface ChatSlice {
  chatSessions: ChatSession[]
  activeChatSessionId: string | null
  /** Keyed by session id so switching sessions doesn't refetch history already loaded once. */
  chatMessagesBySession: Record<string, ChatMessage[]>
  chatLoading: boolean
  chatError: string | null

  loadChatSessions: () => Promise<void>
  createChatSession: (model: string, title?: string) => Promise<void>
  selectChatSession: (sessionId: string) => Promise<void>
  deleteChatSession: (sessionId: string) => Promise<void>
  sendChatMessage: (content: string, activeFile?: ActiveFileContext) => Promise<void>
  handleStreamChunk: (messageId: string, delta: string) => void
  handleStreamEnd: (messageId: string, finishReason: string) => void
}

/** `phase-10-ai-chat.md`'s own acceptance criterion: "streaming tokens are batched at max 16ms
 *  intervals (no per-token re-render)". A chunk arriving over a fast local connection can fire
 *  many times within a single animation frame — buffering deltas here and flushing at most once
 *  per `requestAnimationFrame` (~16ms at 60fps) collapses those into one `set()` call instead of
 *  one per chunk, without adding a fixed setTimeout delay to perceived latency. */
function createStreamBatcher(flush: (messageId: string, delta: string) => void) {
  const pending = new Map<string, string>()
  let scheduled = false

  function runFlush(): void {
    scheduled = false
    for (const [messageId, delta] of pending) {
      flush(messageId, delta)
    }
    pending.clear()
  }

  return {
    push(messageId: string, delta: string): void {
      pending.set(messageId, (pending.get(messageId) ?? '') + delta)
      if (!scheduled) {
        scheduled = true
        requestAnimationFrame(runFlush)
      }
    },
  }
}

export const createChatSlice: StateCreator<AppStore, [['zustand/immer', never]], [], ChatSlice> = (
  set,
  get,
) => {
  const batcher = createStreamBatcher((messageId, delta) => {
    set((state) => {
      for (const messages of Object.values(state.chatMessagesBySession)) {
        const message = messages.find((m) => m.id === messageId)
        if (message) {
          message.content += delta
          return
        }
      }
    })
  })

  return {
    chatSessions: [],
    activeChatSessionId: null,
    chatMessagesBySession: {},
    chatLoading: false,
    chatError: null,

    loadChatSessions: async () => {
      const { accessToken, backendWorkspaceId } = get()
      if (!accessToken || !backendWorkspaceId) return
      set((state) => {
        state.chatLoading = true
        state.chatError = null
      })
      try {
        const sessions = await apiListChatSessions(accessToken, backendWorkspaceId)
        set((state) => {
          state.chatSessions = sessions
          state.chatLoading = false
        })
      } catch (err) {
        set((state) => {
          state.chatError = err instanceof Error ? err.message : 'Failed to load chat sessions'
          state.chatLoading = false
        })
      }
    },

    createChatSession: async (model, title) => {
      const { accessToken, backendWorkspaceId } = get()
      if (!accessToken || !backendWorkspaceId) return
      try {
        const session = await apiCreateChatSession(accessToken, backendWorkspaceId, model, title)
        set((state) => {
          state.chatSessions.unshift(session)
          state.chatMessagesBySession[session.id] = []
          state.activeChatSessionId = session.id
        })
      } catch (err) {
        set((state) => {
          state.chatError = err instanceof Error ? err.message : 'Failed to create chat session'
        })
      }
    },

    selectChatSession: async (sessionId) => {
      set((state) => {
        state.activeChatSessionId = sessionId
      })
      const { accessToken, chatMessagesBySession } = get()
      if (!accessToken || chatMessagesBySession[sessionId]) return
      try {
        const { history } = await apiGetChatSession(accessToken, sessionId)
        set((state) => {
          state.chatMessagesBySession[sessionId] = history
        })
      } catch (err) {
        set((state) => {
          state.chatError = err instanceof Error ? err.message : 'Failed to load chat history'
        })
      }
    },

    deleteChatSession: async (sessionId) => {
      const { accessToken } = get()
      if (!accessToken) return
      try {
        await apiDeleteChatSession(accessToken, sessionId)
        set((state) => {
          state.chatSessions = state.chatSessions.filter((s) => s.id !== sessionId)
          delete state.chatMessagesBySession[sessionId]
          if (state.activeChatSessionId === sessionId) {
            state.activeChatSessionId = state.chatSessions[0]?.id ?? null
          }
        })
      } catch (err) {
        set((state) => {
          state.chatError = err instanceof Error ? err.message : 'Failed to delete chat session'
        })
      }
    },

    sendChatMessage: async (content, activeFile) => {
      const { accessToken, activeChatSessionId } = get()
      if (!accessToken || !activeChatSessionId || !content.trim()) return
      try {
        const userMessage = await apiSendChatMessage(
          accessToken,
          activeChatSessionId,
          content,
          activeFile ?? null,
        )
        set((state) => {
          const messages = (state.chatMessagesBySession[activeChatSessionId] ??= [])
          messages.push(userMessage)
          // The backend hasn't told us the assistant message's real id yet (it streams
          // stream_chunk/stream_end asynchronously) — a placeholder is created the moment the
          // first stream_chunk event arrives for this session (see the WS wiring in App.tsx),
          // not here, since only that event actually carries the real message_id to key on.
        })
      } catch (err) {
        set((state) => {
          state.chatError = err instanceof Error ? err.message : 'Failed to send message'
        })
      }
    },

    handleStreamChunk: (messageId, delta) => {
      const { activeChatSessionId, chatMessagesBySession } = get()
      if (!activeChatSessionId) return
      const messages = chatMessagesBySession[activeChatSessionId]
      const exists = messages?.some((m) => m.id === messageId)
      if (!exists) {
        // First chunk for this reply — create the streaming placeholder now, since this is the
        // first event that actually carries the assistant message's real id.
        set((state) => {
          const list = (state.chatMessagesBySession[activeChatSessionId] ??= [])
          list.push({
            id: messageId,
            sessionId: activeChatSessionId,
            role: 'assistant',
            content: '',
            finishReason: null,
            model: null,
            createdAt: new Date().toISOString(),
            streaming: true,
          })
        })
      }
      batcher.push(messageId, delta)
    },

    handleStreamEnd: (messageId, finishReason) => {
      set((state) => {
        for (const messages of Object.values(state.chatMessagesBySession)) {
          const message = messages.find((m) => m.id === messageId)
          if (message) {
            message.streaming = false
            message.finishReason = finishReason
            return
          }
        }
      })
    },
  }
}
