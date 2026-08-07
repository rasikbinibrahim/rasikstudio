import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { createWorkspaceSlice } from './workspace-slice'
import { createEditorSlice } from './editor-slice'
import { createUiSlice } from './ui-slice'
import { createSettingsSlice } from './settings-slice'
import { createTerminalSlice } from './terminal-slice'
import { createAuthSlice } from './auth-slice'
import { createWsSlice } from './ws-slice'
import { createChatSlice } from './chat-slice'
import { createAgentSlice } from './agent-slice'
import { createGitSlice } from './git-slice'
import { createDockerSlice } from './docker-slice'
import type { AppStore } from './types'

export type { AppStore }

export const useAppStore = create<AppStore>()(
  immer((...a) => ({
    ...createWorkspaceSlice(...a),
    ...createEditorSlice(...a),
    ...createUiSlice(...a),
    ...createSettingsSlice(...a),
    ...createTerminalSlice(...a),
    ...createAuthSlice(...a),
    ...createWsSlice(...a),
    ...createChatSlice(...a),
    ...createAgentSlice(...a),
    ...createGitSlice(...a),
    ...createDockerSlice(...a),
  })),
)
