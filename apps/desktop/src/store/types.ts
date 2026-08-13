import type { WorkspaceSlice } from './workspace-slice'
import type { EditorSlice } from './editor-slice'
import type { UiSlice } from './ui-slice'
import type { SettingsSlice } from './settings-slice'
import type { TerminalSlice } from './terminal-slice'
import type { AuthSlice } from './auth-slice'
import type { WsSlice } from './ws-slice'
import type { ChatSlice } from './chat-slice'
import type { AgentSlice } from './agent-slice'
import type { GitSlice } from './git-slice'
import type { DockerSlice } from './docker-slice'
import type { ModelsSlice } from './models-slice'

export type AppStore = WorkspaceSlice &
  EditorSlice &
  UiSlice &
  SettingsSlice &
  TerminalSlice &
  AuthSlice &
  WsSlice &
  ChatSlice &
  AgentSlice &
  GitSlice &
  DockerSlice &
  ModelsSlice
