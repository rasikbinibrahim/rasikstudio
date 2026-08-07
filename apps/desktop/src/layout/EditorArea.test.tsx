import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditorArea } from './EditorArea'

describe('EditorArea', () => {
  it('renders its children', () => {
    render(
      <EditorArea>
        <div>editor content</div>
      </EditorArea>,
    )
    expect(screen.getByText('editor content')).toBeInTheDocument()
  })
})
