import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScrollArea } from './ScrollArea'

describe('ScrollArea', () => {
  it('renders its children inside the scrollable viewport', () => {
    render(
      <ScrollArea>
        <div>content</div>
      </ScrollArea>,
    )
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('applies an additional className to the root', () => {
    const { container } = render(
      <ScrollArea className="my-extra-class">
        <div>content</div>
      </ScrollArea>,
    )
    expect(container.firstChild).toHaveClass('my-extra-class')
  })
})
