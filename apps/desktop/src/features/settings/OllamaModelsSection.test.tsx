import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '../../store'
import { OllamaModelsSection } from './OllamaModelsSection'
import * as ollamaClient from '../../services/ollama-client'

vi.mock('../../services/ollama-client')

describe('OllamaModelsSection', () => {
  beforeEach(() => {
    useAppStore.setState({ accessToken: 'tok' })
    vi.mocked(ollamaClient.listInstalledOllamaModels).mockResolvedValue([])
  })

  it('shows a loading state, then the installed models with their size', async () => {
    vi.mocked(ollamaClient.listInstalledOllamaModels).mockResolvedValue([
      { name: 'qwen2.5-coder:1.5b', sizeBytes: 986_000_000, modifiedAt: '2026-08-01T00:00:00Z' },
    ])

    render(<OllamaModelsSection />)

    expect(screen.getByText('Loading installed models…')).toBeInTheDocument()
    await screen.findByText('qwen2.5-coder:1.5b')
    expect(screen.getByText('940 MB')).toBeInTheDocument()
  })

  it('shows an empty-state message when nothing is installed', async () => {
    render(<OllamaModelsSection />)

    await screen.findByText(/No models installed, or Ollama isn.t reachable/)
  })

  it('shows the error message when listing fails', async () => {
    vi.mocked(ollamaClient.listInstalledOllamaModels).mockRejectedValue(new Error('Could not reach Ollama'))

    render(<OllamaModelsSection />)

    await screen.findByText('Could not reach Ollama')
  })

  it('pulls a model, shows live progress, and refreshes the list on success', async () => {
    vi.mocked(ollamaClient.listInstalledOllamaModels)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { name: 'qwen2.5-coder:1.5b', sizeBytes: 986_000_000, modifiedAt: '2026-08-01T00:00:00Z' },
      ])
    vi.mocked(ollamaClient.pullOllamaModel).mockImplementation(async (_token, _name, onProgress) => {
      onProgress({ status: 'downloading', total: 1000, completed: 500, error: null })
      onProgress({ status: 'success', total: null, completed: null, error: null })
    })
    render(<OllamaModelsSection />)
    await screen.findByText(/No models installed/)

    await userEvent.type(
      screen.getByPlaceholderText('Model name, e.g. qwen2.5-coder:1.5b'),
      'qwen2.5-coder:1.5b',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Pull' }))

    await screen.findByText('success')
    expect(ollamaClient.pullOllamaModel).toHaveBeenCalledWith(
      'tok',
      'qwen2.5-coder:1.5b',
      expect.any(Function),
    )
    await screen.findByText('qwen2.5-coder:1.5b')
    expect(screen.getByPlaceholderText('Model name, e.g. qwen2.5-coder:1.5b')).toHaveValue('')
  })

  it('shows the pull error message and does not clear the input on failure', async () => {
    vi.mocked(ollamaClient.pullOllamaModel).mockRejectedValue(new Error('model not found'))
    render(<OllamaModelsSection />)
    await screen.findByText(/No models installed/)

    await userEvent.type(screen.getByPlaceholderText('Model name, e.g. qwen2.5-coder:1.5b'), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Pull' }))

    await screen.findByText('model not found')
    expect(screen.getByPlaceholderText('Model name, e.g. qwen2.5-coder:1.5b')).toHaveValue('nope')
  })

  it('removes a model and refreshes the list', async () => {
    vi.mocked(ollamaClient.listInstalledOllamaModels)
      .mockResolvedValueOnce([
        { name: 'qwen2.5-coder:1.5b', sizeBytes: 986_000_000, modifiedAt: '2026-08-01T00:00:00Z' },
      ])
      .mockResolvedValueOnce([])
    vi.mocked(ollamaClient.deleteOllamaModel).mockResolvedValue(undefined)
    render(<OllamaModelsSection />)
    await screen.findByText('qwen2.5-coder:1.5b')

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => {
      expect(ollamaClient.deleteOllamaModel).toHaveBeenCalledWith('tok', 'qwen2.5-coder:1.5b')
    })
    await screen.findByText(/No models installed/)
  })

  it('the Pull button is disabled until a model name is typed', async () => {
    render(<OllamaModelsSection />)
    await screen.findByText(/No models installed/)

    expect(screen.getByRole('button', { name: 'Pull' })).toBeDisabled()

    await userEvent.type(screen.getByPlaceholderText('Model name, e.g. qwen2.5-coder:1.5b'), 'x')

    expect(screen.getByRole('button', { name: 'Pull' })).toBeEnabled()
  })
})
