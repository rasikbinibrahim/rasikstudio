import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tooltip } from './Tooltip'

describe('Tooltip', () => {
  it('always renders its trigger children', () => {
    render(
      <Tooltip content="Helpful text">
        <button type="button">Trigger</button>
      </Tooltip>,
    )
    expect(screen.getByRole('button', { name: 'Trigger' })).toBeInTheDocument()
  })

  it('does not show the tooltip content until triggered', () => {
    render(
      <Tooltip content="Helpful text">
        <button type="button">Trigger</button>
      </Tooltip>,
    )
    expect(screen.queryByText('Helpful text')).not.toBeInTheDocument()
  })

  it('shows the tooltip content when the trigger receives focus', async () => {
    render(
      <Tooltip content="Helpful text" delay={0}>
        <button type="button">Trigger</button>
      </Tooltip>,
    )

    await userEvent.tab()

    expect(await screen.findByText('Helpful text')).toBeInTheDocument()
  })
})
