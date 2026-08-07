export type AgentTaskStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

// AGENT_FRAMEWORK.md §3's table — hardcoded because no `GET /agents/types`-style endpoint exists
// to fetch this list from the backend; `agent_factory.available_agent_types()` is a pure Python
// list with no HTTP route in front of it. Revisit if that ever changes.
export const AGENT_TYPES = [
  'orchestrator',
  'coder',
  'tester',
  'debugger',
  'doc_writer',
  'researcher',
  'reviewer',
] as const

export type AgentType = (typeof AGENT_TYPES)[number]

export interface AgentTask {
  id: string
  workspaceId: string
  description: string
  status: AgentTaskStatus
  model: string | null
  result: string | null
  error: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
}

export interface AgentTaskStep {
  id: string
  index: number
  tool: string
  args: Record<string, unknown>
  result: string | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt: string | null
  finishedAt: string | null
}

export interface AgentApprovalRequest {
  action: string
  preview: string | null
}
