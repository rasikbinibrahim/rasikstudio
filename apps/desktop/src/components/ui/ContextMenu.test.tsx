import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContextMenu } from './ContextMenu'

const items = [
  { id: 'rename', label: 'Rename', onSelect: vi.fn() },
  { id: 'delete', label: 'Delete', onSelect: vi.fn(), danger: true },
]

describe('ContextMenu', () => {
  it('renders its trigger children', () => {
    render(
      <ContextMenu items={items}>
        <div>Right-click me</div>
      </ContextMenu>,
    )
    expect(screen.getByText('Right-click me')).toBeInTheDocument()
  })

  it('opens and shows every item on right-click, and calls onSelect when one is chosen', async () => {
    const onSelect = vi.fn()
    render(
      <ContextMenu items={[{ id: 'rename', label: 'Rename', onSelect }]}>
        <div>Right-click me</div>
      </ContextMenu>,
    )

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByText('Right-click me') })

    const menuItem = await screen.findByText('Rename')
    await userEvent.click(menuItem)

    expect(onSelect).toHaveBeenCalledOnce()
  })
})
