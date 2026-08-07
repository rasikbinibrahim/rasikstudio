import { describe, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileTreeNode } from '/home/rasiknizam/project/Rasik-Studio/apps/desktop/src/features/file-explorer/FileTreeNode'
import { useAppStore } from '/home/rasiknizam/project/Rasik-Studio/apps/desktop/src/store'

describe('debug', () => {
  it('debug rename', async () => {
    ;(window as unknown as { rasik: object }).rasik = {
      files: { move: vi.fn(async () => ({ ok: true, data: null })), delete: vi.fn(async () => ({ ok: true, data: null })) },
      shell: { showItemInFolder: vi.fn(async () => ({ ok: true, data: null })) },
    }
    useAppStore.setState({ workspaceRoot: '/ws', gitStatus: null })
    render(
      <FileTreeNode
        entry={{ name: 'App.tsx', path: 'src/App.tsx', isDirectory: false }}
        depth={0}
        tree={{
          rootEntries: [],
          childrenByPath: {},
          expandedPaths: new Set(),
          loadingPaths: new Set(),
          toggleExpand: vi.fn(),
          refreshParentOf: vi.fn(),
        }}
      />,
    )

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('App.tsx') })
    const renameItem = await screen.findByText('Rename')
    console.log('FOUND RENAME ITEM', renameItem.outerHTML)
    await userEvent.click(renameItem)
    screen.debug(undefined, 20000)
  })
})
