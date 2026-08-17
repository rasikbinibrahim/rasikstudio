import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModelPicker } from './ModelPicker'
import type { ModelPickerOption } from './ModelPicker'

const OPTIONS: ModelPickerOption[] = [
  { id: 'claude-sonnet-4-5', label: 'claude-sonnet-4-5', provider: 'anthropic', available: true },
  { id: 'gpt-4o-mini', label: 'gpt-4o-mini', provider: 'openai', available: false },
  { id: 'qwen2.5-coder:1.5b', label: 'qwen2.5-coder:1.5b', provider: 'ollama', available: true },
]

async function openMenu(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: /claude-sonnet-4-5/ }))
}

describe('ModelPicker', () => {
  it('shows the current selection on the closed trigger', () => {
    render(<ModelPicker options={OPTIONS} value="claude-sonnet-4-5" onChange={vi.fn()} onManageModels={vi.fn()} />)
    expect(screen.getByRole('button', { name: /claude-sonnet-4-5/ })).toBeInTheDocument()
  })

  it('lists every option when opened, tagging unavailable ones as "Not configured"', async () => {
    render(<ModelPicker options={OPTIONS} value="claude-sonnet-4-5" onChange={vi.fn()} onManageModels={vi.fn()} />)
    await openMenu()

    expect(screen.getByRole('menuitem', { name: /qwen2\.5-coder/ })).toBeInTheDocument()
    const unavailable = screen.getByRole('menuitem', { name: /gpt-4o-mini/ })
    expect(unavailable).toHaveTextContent('Not configured')
  })

  it('calls onChange with the selected model id', async () => {
    const onChange = vi.fn()
    render(<ModelPicker options={OPTIONS} value="claude-sonnet-4-5" onChange={onChange} onManageModels={vi.fn()} />)
    await openMenu()

    await userEvent.click(screen.getByRole('menuitem', { name: /qwen2\.5-coder/ }))

    expect(onChange).toHaveBeenCalledWith('qwen2.5-coder:1.5b')
  })

  it('filters options via the search field', async () => {
    render(<ModelPicker options={OPTIONS} value="claude-sonnet-4-5" onChange={vi.fn()} onManageModels={vi.fn()} />)
    await openMenu()

    await userEvent.type(screen.getByPlaceholderText('Search models…'), 'gpt')

    expect(screen.getByRole('menuitem', { name: /gpt-4o-mini/ })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /claude-sonnet-4-5/ })).not.toBeInTheDocument()
  })

  it('shows a no-match message when the search query matches nothing', async () => {
    render(<ModelPicker options={OPTIONS} value="claude-sonnet-4-5" onChange={vi.fn()} onManageModels={vi.fn()} />)
    await openMenu()

    await userEvent.type(screen.getByPlaceholderText('Search models…'), 'nonexistent-model')

    expect(screen.getByText(/No models match/)).toBeInTheDocument()
  })

  it('calls onManageModels when "Manage Models…" is selected', async () => {
    const onManageModels = vi.fn()
    render(<ModelPicker options={OPTIONS} value="claude-sonnet-4-5" onChange={vi.fn()} onManageModels={onManageModels} />)
    await openMenu()

    await userEvent.click(screen.getByRole('menuitem', { name: /Manage Models/ }))

    expect(onManageModels).toHaveBeenCalled()
  })

  it('closes the menu after a selection', async () => {
    render(<ModelPicker options={OPTIONS} value="claude-sonnet-4-5" onChange={vi.fn()} onManageModels={vi.fn()} />)
    await openMenu()

    await userEvent.click(screen.getByRole('menuitem', { name: /qwen2\.5-coder/ }))

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })
})
