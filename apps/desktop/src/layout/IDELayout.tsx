import type { ReactNode } from 'react'
import { ActivityBar } from './ActivityBar'
import { LeftSidebar } from './LeftSidebar'
import { EditorArea } from './EditorArea'
import { BottomPanel } from './BottomPanel'
import { StatusBar } from './StatusBar'
import { ResizablePanel, ResizablePanelGroup, ResizeHandle } from './ResizablePanel'
import { useAppStore } from '../store'

export interface IDELayoutProps {
  sidebar: ReactNode
  editor: ReactNode
  bottomPanel: ReactNode
}

export function IDELayout({ sidebar, editor, bottomPanel }: IDELayoutProps): JSX.Element {
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed)
  const bottomPanelCollapsed = useAppStore((state) => state.bottomPanelCollapsed)

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex min-h-0 flex-1">
        <ActivityBar />
        <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
          {!sidebarCollapsed && (
            <>
              <ResizablePanel id="sidebar" order={1} defaultSize={20} minSize={12} maxSize={40}>
                <LeftSidebar>{sidebar}</LeftSidebar>
              </ResizablePanel>
              <ResizeHandle />
            </>
          )}
          <ResizablePanel id="main" order={2} defaultSize={80} minSize={30}>
            <ResizablePanelGroup direction="vertical" className="h-full">
              <ResizablePanel id="editor-area" order={1} defaultSize={70} minSize={20}>
                <EditorArea>{editor}</EditorArea>
              </ResizablePanel>
              {!bottomPanelCollapsed && (
                <>
                  <ResizeHandle />
                  <ResizablePanel id="bottom-panel" order={2} defaultSize={30} minSize={10} maxSize={70}>
                    <BottomPanel>{bottomPanel}</BottomPanel>
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <StatusBar />
    </div>
  )
}
