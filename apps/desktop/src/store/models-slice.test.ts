import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './index'
import * as modelsClient from '../services/models-client'
import type { ModelInfo } from '../types/models'

vi.mock('../services/models-client')

function model(overrides: Partial<ModelInfo> = {}): ModelInfo {
  return { id: 'gpt-4o-mini', provider: 'openai', contextWindow: 128000, available: true, ...overrides }
}

describe('models-slice', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useAppStore.setState({ accessToken: 'tok', models: [], modelsLoading: false, modelsLoaded: false })
  })

  it('loadModels fetches and stores the live catalog', async () => {
    vi.mocked(modelsClient.listModels).mockResolvedValue([model()])

    await useAppStore.getState().loadModels()

    expect(useAppStore.getState().models).toEqual([model()])
    expect(useAppStore.getState().modelsLoaded).toBe(true)
    expect(useAppStore.getState().modelsLoading).toBe(false)
  })

  it('is a no-op without an access token', async () => {
    useAppStore.setState({ accessToken: null })

    await useAppStore.getState().loadModels()

    expect(modelsClient.listModels).not.toHaveBeenCalled()
    expect(useAppStore.getState().modelsLoaded).toBe(false)
  })

  it('is a no-op if already loaded', async () => {
    useAppStore.setState({ modelsLoaded: true })

    await useAppStore.getState().loadModels()

    expect(modelsClient.listModels).not.toHaveBeenCalled()
  })

  it('is a no-op if already loading (no duplicate concurrent fetch)', async () => {
    useAppStore.setState({ modelsLoading: true })

    await useAppStore.getState().loadModels()

    expect(modelsClient.listModels).not.toHaveBeenCalled()
  })

  it('leaves models empty and still marks modelsLoaded on failure, rather than throwing', async () => {
    vi.mocked(modelsClient.listModels).mockRejectedValue(new Error('backend unreachable'))

    await useAppStore.getState().loadModels()

    expect(useAppStore.getState().models).toEqual([])
    expect(useAppStore.getState().modelsLoaded).toBe(true)
    expect(useAppStore.getState().modelsLoading).toBe(false)
  })
})
