import { getBackendHttpBaseUrl } from '../lib/backend-config'
import type { ActiveFileContext, ChatMessage, ChatSession } from '../types/chat'

// Raw wire shapes match apps/backend/app/api/v1/chat.py's Pydantic schemas exactly (snake_case);
// mapped to the camelCase domain types in ../types/chat.ts at the call site, same convention
// AuthDialog.tsx already uses for `CurrentUser` -> `AuthUser`.
interface RawSession {
  id: string
  workspace_id: string
  title: string
  model: string
  system_prompt: string | null
  created_at: string
  updated_at: string
}

interface RawMessage {
  id: string
  session_id: string
  role: ChatMessage['role']
  content: string | null
  finish_reason: string | null
  model: string | null
  created_at: string
}

interface RawSessionList {
  items: RawSession[]
  total: number
}

interface RawSessionDetail {
  session: RawSession
  history: RawMessage[]
}

interface ErrorBody {
  error?: { message?: string }
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ErrorBody | null
  return body?.error?.message ?? fallback
}

async function request<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getBackendHttpBaseUrl()}/api/v1/chat${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  })
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, `Request failed (${response.status})`))
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

function toSession(raw: RawSession): ChatSession {
  return {
    id: raw.id,
    workspaceId: raw.workspace_id,
    title: raw.title,
    model: raw.model,
    systemPrompt: raw.system_prompt,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

function toMessage(raw: RawMessage, streaming = false): ChatMessage {
  return {
    id: raw.id,
    sessionId: raw.session_id,
    role: raw.role,
    content: raw.content ?? '',
    finishReason: raw.finish_reason,
    model: raw.model,
    createdAt: raw.created_at,
    streaming,
  }
}

export async function createChatSession(
  accessToken: string,
  workspaceId: string,
  model: string,
  title = 'New Chat',
): Promise<ChatSession> {
  const raw = await request<RawSession>('/sessions', accessToken, {
    method: 'POST',
    body: JSON.stringify({ workspace_id: workspaceId, model, title }),
  })
  return toSession(raw)
}

export async function listChatSessions(accessToken: string, workspaceId: string): Promise<ChatSession[]> {
  const raw = await request<RawSessionList>(
    `/sessions?workspace_id=${encodeURIComponent(workspaceId)}`,
    accessToken,
  )
  return raw.items.map(toSession)
}

export async function getChatSession(
  accessToken: string,
  sessionId: string,
): Promise<{ session: ChatSession; history: ChatMessage[] }> {
  const raw = await request<RawSessionDetail>(`/sessions/${sessionId}`, accessToken)
  return { session: toSession(raw.session), history: raw.history.map((m) => toMessage(m)) }
}

export async function deleteChatSession(accessToken: string, sessionId: string): Promise<void> {
  await request<void>(`/sessions/${sessionId}`, accessToken, { method: 'DELETE' })
}

export async function sendChatMessage(
  accessToken: string,
  sessionId: string,
  content: string,
  activeFile: ActiveFileContext | null,
  includeGitDiff = false,
): Promise<ChatMessage> {
  const raw = await request<RawMessage>(`/sessions/${sessionId}/messages`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      content,
      active_file: activeFile ? { path: activeFile.path, content: activeFile.content } : null,
      include_git_diff: includeGitDiff,
    }),
  })
  return toMessage(raw)
}
