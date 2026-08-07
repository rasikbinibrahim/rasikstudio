import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '../store'
import { ActivityBar } from './ActivityBar'

describe('ActivityBar', () => {
  beforeEach(() => {
    useAppStore.setState({ sidebarCollapsed: false, activeSidebarView: 'explorer' })
  })

  it('renders an icon button for every sidebar view', () => {
    render(<ActivityBar />)
    for (const label of ['Explorer', 'Source Control', 'AI Chat', 'Agent Tasks', 'Browser', 'Docker']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('marks the active view as pressed', () => {
    render(<ActivityBar />)
    expect(screen.getByRole('button', { name: 'Explorer' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Source Control' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('switches the active view when a different icon is clicked', async () => {
    render(<ActivityBar />)

    await userEvent.click(screen.getByRole('button', { name: 'Source Control' }))

    expect(useAppStore.getState().activeSidebarView).toBe('git')
    expect(useAppStore.getState().sidebarCollapsed).toBe(false)
  })

  it('re-collapses the sidebar when clicking the already-active view', async () => {
    render(<ActivityBar />)

    await userEvent.click(screen.getByRole('button', { name: 'Explorer' }))

    expect(useAppStore.getState().sidebarCollapsed).toBe(true)
  })
})
