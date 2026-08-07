import { useFileTree } from './useFileTree'
import { FileTreeNode } from './FileTreeNode'

export function FileTree(): JSX.Element {
  const tree = useFileTree()

  return (
    <div className="flex-1 overflow-auto py-1">
      {tree.rootEntries.map((entry) => (
        <FileTreeNode key={entry.path} entry={entry} depth={0} tree={tree} />
      ))}
    </div>
  )
}
