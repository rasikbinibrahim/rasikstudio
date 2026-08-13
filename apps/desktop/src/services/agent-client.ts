import { getBackendHttpBaseUrl } from '../lib/backend-config'
import type { AgentTask, AgentTaskStatus, AgentTaskStep } from '../types/agent'

// Raw wire shapes match apps/backend/app/api/v1/agents.py's Pydantic schemas (snake_case) —
// mapped to camelCase domain types at the call site, same convention as chat-client.ts.
interface RawTask {
  id: string
  workspace_id: string
  description: string
  status: AgentTaskStatus
  model: string | null
  result: string | null
  error: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

interface RawStep {
  id: string
  index: number
  tool: string
  args: Record<string, unknown>
  result: string | null
  status: AgentTaskStep['status']
  started_at: string | null
  finished_at: string | null
}

interface RawTaskList {
  items: RawTask[]
  total: number
}

interface RawStepList {
  items: RawStep[]
  total: number
}

interface ErrorBody {
  error?: { message?: string }
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ErrorBody | null
  return body?.error?.message ?? fallback
}

async function request<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getBackendHttpBaseUrl()}/api/v1/agents${path}`, {
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

function toTask(raw: RawTask): AgentTask {
  return {
    id: raw.id,
    workspaceId: raw.workspace_id,
    description: raw.description,
    status: raw.status,
    model: raw.model,
    result: raw.result,
    error: raw.error,
    startedAt: raw.started_at,
    finishedAt: raw.finished_at,
    createdAt: raw.created_at,
  }
}

function toStep(raw: RawStep): AgentTaskStep {
  return {
    id: raw.id,
    index: raw.index,
    tool: raw.tool,
    args: raw.args,
    result: raw.result,
    status: raw.status,
    startedAt: raw.started_at,
    finishedAt: raw.finished_at,
  }
}

export async function createAgentTask(
  accessToken: string,
  workspaceId: string,
  agentType: string,
  description: string,
  model: string,
  requireApproval = true,
): Promise<AgentTask> {
  const raw = await request<RawTask>('/tasks', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      workspace_id: workspaceId,
      agent_type: agentType,
      description,
      model,
      require_approval: requireApproval,
    }),
  })
  return toTask(raw)
}

export async function listAgentTasks(accessToken: string, workspaceId: string): Promise<AgentTask[]> {
  const raw = await request<RawTaskList>(
    `/tasks?workspace_id=${encodeURIComponent(workspaceId)}`,
    accessToken,
  )
  return raw.items.map(toTask)
}

export async function getAgentTask(accessToken: string, taskId: string): Promise<AgentTask> {
  const raw = await request<RawTask>(`/tasks/${taskId}`, accessToken)
  return toTask(raw)
}

export async function getAgentTaskSteps(accessToken: string, taskId: string): Promise<AgentTaskStep[]> {
  const raw = await request<RawStepList>(`/tasks/${taskId}/steps`, accessToken)
  return raw.items.map(toStep)
}

export async function approveAgentTask(
  accessToken: string,
  taskId: string,
  approved: boolean,
  reason?: string,
): Promise<void> {
  await request<void>(`/tasks/${taskId}/approve`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ approved, reason: reason ?? null }),
  })
}

export async function cancelAgentTask(accessToken: string, taskId: string): Promise<void> {
  await request<void>(`/tasks/${taskId}/cancel`, accessToken, { method: 'POST' })
}

export async function answerAgentQuestion(
  accessToken: string,
  taskId: string,
  answer: string,
): Promise<void> {
  await request<void>(`/tasks/${taskId}/answer`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ answer }),
  })
}
