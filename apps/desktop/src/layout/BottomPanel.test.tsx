import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BottomPanel } from './BottomPanel'

describe('BottomPanel', () => {
  it('renders its children', () => {
    render(
      <BottomPanel>
        <div>terminal content</div>
      </BottomPanel>,
    )
    expect(screen.getByText('terminal content')).toBeInTheDocument()
  })
})
