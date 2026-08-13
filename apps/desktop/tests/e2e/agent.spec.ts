import { test, expect, setSidebarView } from './fixtures/electron-app'
import { isBackendReachable } from './fixtures/backend'

// Flow 3 of 8 (`phase-16-testing.md`): agent task execution with an approval gate. Same real
// backend dependency (and same honest skip) as `chat.spec.ts` — see that file's comment.

test.beforeEach(async () => {
  test.skip(!(await isBackendReachable()), 'backend not running at 127.0.0.1:8000 — start it with `docker compose up` + `pnpm --filter backend dev` to run this test for real')
})

test('the Agent Tasks panel opens and is ready to accept a new task description', async ({ window }) => {
  await setSidebarView(window, 'agents')

  // `AgentTaskList.tsx`'s task-creation form — a real signed-in session (same gap noted in
  // `chat.spec.ts`) is additionally needed to actually submit a task and drive it through
  // `agent_task_steps`/the approval-gate UI (`AgentApprovalPrompt.tsx`); this verifies the panel
  // itself is real and reachable, not a placeholder.
  await expect(window.getByPlaceholder(/describe.*task/i)).toBeVisible({ timeout: 10_000 })
})
