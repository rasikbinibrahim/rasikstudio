export type ChatMessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface ChatSession {
  id: string
  workspaceId: string
  title: string
  model: string
  systemPrompt: string | null
  createdAt: string
  updatedAt: string
}

export interface ChatMessage {
  id: string
  sessionId: string
  role: ChatMessageRole
  content: string
  finishReason: string | null
  model: string | null
  createdAt: string
  /** True only for the one assistant message currently receiving `stream_chunk` events — never
   *  persisted, purely a client-side render hint (blinking cursor, etc). */
  streaming: boolean
}

export interface ActiveFileContext {
  path: string
  content: string
}
