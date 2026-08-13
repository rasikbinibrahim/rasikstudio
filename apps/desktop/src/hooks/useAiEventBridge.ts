import { useWebSocketEvent } from './useWebSocket'
import { useAppStore } from '../store'
import type { WsEvent } from '../services/ws-client'

/** Wires every `stream_chunk`/`stream_end`/`agent_*`/`index_progress` WebSocket event (published
 *  by `apps/backend/app/api/ws/publisher.py`, Phase 7's gateway) into the chat/agent/workspace
 *  store slices' handlers. Mounted once at the top of the app (not inside `ChatPanel`/`AgentPanel`)
 *  so a task running while the user is looking at a different sidebar view still updates state —
 *  switching back to Chat, Agent Tasks, or the Explorer shows the current state immediately
 *  instead of only whatever arrived while that panel happened to be mounted. */
export function useAiEventBridge(): void {
  const handleStreamChunk = useAppStore((state) => state.handleStreamChunk)
  const handleStreamEnd = useAppStore((state) => state.handleStreamEnd)
  const handleAgentStarted = useAppStore((state) => state.handleAgentStarted)
  const handleAgentStep = useAppStore((state) => state.handleAgentStep)
  const handleAgentApprovalRequired = useAppStore((state) => state.handleAgentApprovalRequired)
  const handleAgentQuestionAsked = useAppStore((state) => state.handleAgentQuestionAsked)
  const handleAgentStatusChanged = useAppStore((state) => state.handleAgentStatusChanged)
  const handleAgentCompleted = useAppStore((state) => state.handleAgentCompleted)
  const handleAgentFailed = useAppStore((state) => state.handleAgentFailed)
  const handleIndexProgress = useAppStore((state) => state.handleIndexProgress)

  useWebSocketEvent('stream_chunk', (event: WsEvent) => {
    handleStreamChunk(event.message_id as string, event.delta as string)
  })
  useWebSocketEvent('stream_end', (event: WsEvent) => {
    handleStreamEnd(event.message_id as string, event.finish_reason as string)
  })
  useWebSocketEvent('agent_started', (event: WsEvent) => {
    handleAgentStarted(event.task_id as string)
  })
  useWebSocketEvent('agent_step', (event: WsEvent) => {
    handleAgentStep(
      event.task_id as string,
      event.step_index as number,
      event.tool as string,
      event.args as Record<string, unknown>,
      (event.result as string | null) ?? null,
    )
  })
  useWebSocketEvent('agent_approval_required', (event: WsEvent) => {
    handleAgentApprovalRequired(event.task_id as string, event.action as string, (event.preview as string | null) ?? null)
  })
  useWebSocketEvent('agent_question_asked', (event: WsEvent) => {
    handleAgentQuestionAsked(event.task_id as string, event.question as string)
  })
  useWebSocketEvent('agent_status_changed', (event: WsEvent) => {
    handleAgentStatusChanged(event.task_id as string, event.status as Parameters<typeof handleAgentStatusChanged>[1])
  })
  useWebSocketEvent('agent_completed', (event: WsEvent) => {
    handleAgentCompleted(event.task_id as string, event.summary as string)
  })
  useWebSocketEvent('agent_failed', (event: WsEvent) => {
    handleAgentFailed(event.task_id as string, event.error as string)
  })
  useWebSocketEvent('index_progress', (event: WsEvent) => {
    handleIndexProgress(event.files_done as number, event.files_total as number)
  })
}
