import type { StateCreator } from 'zustand'
import type { Draft } from 'immer'
import type { AppStore } from './types'
import type { AgentTask, AgentTaskStatus, AgentTaskStep } from '../types/agent'
import {
  answerAgentQuestion as apiAnswerAgentQuestion,
  approveAgentTask as apiApproveAgentTask,
  cancelAgentTask as apiCancelAgentTask,
  createAgentTask as apiCreateAgentTask,
  getAgentTaskSteps as apiGetAgentTaskSteps,
  listAgentTasks as apiListAgentTasks,
} from '../services/agent-client'

export interface AgentSlice {
  agentTasks: AgentTask[]
  activeAgentTaskId: string | null
  agentStepsByTask: Record<string, AgentTaskStep[]>
  /** Task ids currently paused on `agent_approval_required`, keyed by task id — at most one
   *  pending prompt per task at a time, since the ReAct loop is sequential. */
  agentPendingApproval: Record<string, { action: string; preview: string | null }>
  /** Task ids currently paused on `agent_question_asked` (the `ask_followup_question` tool,
   *  Cline's clarifying-question equivalent — see `docs/reference/cline/TOOL_DESIGN_NOTES.md`)
   *  — distinct from `agentPendingApproval`, since a question is an open-ended free-text answer,
   *  not a binary approve/deny decision. Also at most one per task at a time. */
  agentPendingQuestion: Record<string, { question: string }>
  agentLoading: boolean
  agentError: string | null

  loadAgentTasks: () => Promise<void>
  createAgentTask: (
    agentType: string,
    description: string,
    model: string,
    requireApproval?: boolean,
  ) => Promise<void>
  selectAgentTask: (taskId: string) => Promise<void>
  /** `reason` is only meaningful on a denial (`approved: false`) — the backend folds it into the
   *  denied tool call's own observation so the agent can plan around *why*, not just that it was
   *  refused (see `docs/reference/cline/APPROVAL_GATE_NOTES.md`, which named this real gap). */
  approveAgentTask: (taskId: string, approved: boolean, reason?: string) => Promise<void>
  /** Answers a pending `ask_followup_question` — the free-text counterpart to `approveAgentTask`. */
  answerAgentQuestion: (taskId: string, answer: string) => Promise<void>
  cancelAgentTask: (taskId: string) => Promise<void>

  handleAgentStarted: (taskId: string) => void
  handleAgentStep: (
    taskId: string,
    index: number,
    tool: string,
    args: Record<string, unknown>,
    result: string | null,
  ) => void
  handleAgentApprovalRequired: (taskId: string, action: string, preview: string | null) => void
  handleAgentQuestionAsked: (taskId: string, question: string) => void
  handleAgentStatusChanged: (taskId: string, status: AgentTaskStatus) => void
  handleAgentCompleted: (taskId: string, summary: string) => void
  handleAgentFailed: (taskId: string, error: string) => void
}

function setTaskStatus(state: Draft<AppStore>, taskId: string, status: AgentTaskStatus): void {
  const task = state.agentTasks.find((t) => t.id === taskId)
  if (task) task.status = status
}

export const createAgentSlice: StateCreator<AppStore, [['zustand/immer', never]], [], AgentSlice> = (
  set,
  get,
) => ({
  agentTasks: [],
  activeAgentTaskId: null,
  agentStepsByTask: {},
  agentPendingApproval: {},
  agentPendingQuestion: {},
  agentLoading: false,
  agentError: null,

  loadAgentTasks: async () => {
    const { accessToken, backendWorkspaceId } = get()
    if (!accessToken || !backendWorkspaceId) return
    set((state) => {
      state.agentLoading = true
      state.agentError = null
    })
    try {
      const tasks = await apiListAgentTasks(accessToken, backendWorkspaceId)
      set((state) => {
        state.agentTasks = tasks
        state.agentLoading = false
      })
    } catch (err) {
      set((state) => {
        state.agentError = err instanceof Error ? err.message : 'Failed to load agent tasks'
        state.agentLoading = false
      })
    }
  },

  createAgentTask: async (agentType, description, model, requireApproval = true) => {
    const { accessToken, backendWorkspaceId } = get()
    if (!accessToken || !backendWorkspaceId || !description.trim()) return
    try {
      const task = await apiCreateAgentTask(
        accessToken,
        backendWorkspaceId,
        agentType,
        description,
        model,
        requireApproval,
      )
      set((state) => {
        state.agentTasks.unshift(task)
        state.agentStepsByTask[task.id] = []
        state.activeAgentTaskId = task.id
      })
    } catch (err) {
      set((state) => {
        state.agentError = err instanceof Error ? err.message : 'Failed to create agent task'
      })
    }
  },

  selectAgentTask: async (taskId) => {
    set((state) => {
      state.activeAgentTaskId = taskId
    })
    const { accessToken, agentStepsByTask } = get()
    if (!accessToken || agentStepsByTask[taskId]) return
    try {
      const steps = await apiGetAgentTaskSteps(accessToken, taskId)
      set((state) => {
        state.agentStepsByTask[taskId] = steps
      })
    } catch (err) {
      set((state) => {
        state.agentError = err instanceof Error ? err.message : 'Failed to load task steps'
      })
    }
  },

  approveAgentTask: async (taskId, approved, reason) => {
    const { accessToken } = get()
    if (!accessToken) return
    set((state) => {
      delete state.agentPendingApproval[taskId]
    })
    try {
      await apiApproveAgentTask(accessToken, taskId, approved, reason)
    } catch (err) {
      set((state) => {
        state.agentError = err instanceof Error ? err.message : 'Failed to resolve approval'
      })
    }
  },

  answerAgentQuestion: async (taskId, answer) => {
    const { accessToken } = get()
    if (!accessToken || !answer.trim()) return
    set((state) => {
      delete state.agentPendingQuestion[taskId]
    })
    try {
      await apiAnswerAgentQuestion(accessToken, taskId, answer)
    } catch (err) {
      set((state) => {
        state.agentError = err instanceof Error ? err.message : 'Failed to answer question'
      })
    }
  },

  cancelAgentTask: async (taskId) => {
    const { accessToken } = get()
    if (!accessToken) return
    try {
      await apiCancelAgentTask(accessToken, taskId)
    } catch (err) {
      set((state) => {
        state.agentError = err instanceof Error ? err.message : 'Failed to cancel task'
      })
    }
  },

  handleAgentStarted: (taskId) => {
    set((state) => setTaskStatus(state, taskId, 'running'))
  },

  handleAgentStep: (taskId, index, tool, args, result) => {
    set((state) => {
      const steps = (state.agentStepsByTask[taskId] ??= [])
      const existing = steps.find((s) => s.index === index)
      const status: AgentTaskStep['status'] =
        result === null ? 'running' : result.startsWith('Error:') ? 'failed' : 'completed'
      if (existing) {
        existing.tool = tool
        existing.args = args
        existing.result = result
        existing.status = status
      } else {
        steps.push({
          id: `${taskId}:${index}`,
          index,
          tool,
          args,
          result,
          status,
          startedAt: null,
          finishedAt: null,
        })
      }
    })
  },

  handleAgentApprovalRequired: (taskId, action, preview) => {
    set((state) => {
      state.agentPendingApproval[taskId] = { action, preview }
      setTaskStatus(state, taskId, 'paused')
    })
  },

  handleAgentQuestionAsked: (taskId, question) => {
    set((state) => {
      state.agentPendingQuestion[taskId] = { question }
      setTaskStatus(state, taskId, 'paused')
    })
  },

  handleAgentStatusChanged: (taskId, status) => {
    set((state) => {
      setTaskStatus(state, taskId, status)
      if (status !== 'paused') {
        delete state.agentPendingApproval[taskId]
        delete state.agentPendingQuestion[taskId]
      }
    })
  },

  handleAgentCompleted: (taskId, summary) => {
    set((state) => {
      const task = state.agentTasks.find((t) => t.id === taskId)
      if (task) {
        task.status = 'completed'
        task.result = summary
      }
    })
  },

  handleAgentFailed: (taskId, error) => {
    set((state) => {
      const task = state.agentTasks.find((t) => t.id === taskId)
      if (task) {
        task.status = 'failed'
        task.error = error
      }
    })
  },
})
