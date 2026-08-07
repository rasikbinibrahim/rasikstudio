import { Circle } from 'lucide-react'
import { Tabs } from '../../components/ui'
import { useAppStore } from '../../store'

export function EditorTabBar(): JSX.Element | null {
  const openFiles = useAppStore((state) => state.openFiles)
  const activeFileId = useAppStore((state) => state.activeFileId)
  const setActiveFile = useAppStore((state) => state.setActiveFile)
  const closeFile = useAppStore((state) => state.closeFile)

  if (openFiles.length === 0) return null

  return (
    <Tabs
      tabs={openFiles.map((file) => ({
        id: file.id,
        label: file.name,
        closeable: true,
        icon: file.isDirty ? (
          <Circle size={8} className="fill-current text-text-primary" />
        ) : undefined,
      }))}
      activeId={activeFileId}
      onTabChange={setActiveFile}
      onTabClose={closeFile}
    />
  )
}
