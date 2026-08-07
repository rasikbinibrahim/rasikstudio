import { afterEach, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { DockerCommandError, DockerService } from './docker-service'

const execFileAsync = promisify(execFile)

// Runs against a real Docker daemon (same "real behavior beats a mock" standard git-service.test.ts
// already established) — DockerService is a thin CLI wrapper, so the only thing worth verifying is
// that it invokes real `docker` correctly and parses real output, not that a mock returns what we
// told it to. This environment has a real, running Docker daemon (confirmed during Phase 14
// planning), so there's no reason to fake it.

async function createTestContainer(): Promise<string> {
  const name = `rasik-test-${randomUUID().slice(0, 8)}`
  await execFileAsync('docker', ['run', '-d', '--name', name, 'redis:7-alpine'])
  return name
}

async function removeTestContainer(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-f', name]).catch(() => undefined)
}

describe('DockerService', () => {
  const service = new DockerService()
  const createdNames: string[] = []

  afterEach(async () => {
    while (createdNames.length > 0) {
      const name = createdNames.pop()
      if (name) await removeTestContainer(name)
    }
    // Default 10s hook timeout is occasionally too tight for a real `docker rm -f` under load
    // (e.g. the whole suite's other Docker-heavy tests competing for the daemon) — 20s matches
    // the per-test timeout already used below for the same reason.
  }, 20_000)

  it('listContainers() finds a real running container with the expected fields parsed', async () => {
    const name = await createTestContainer()
    createdNames.push(name)

    const containers = await service.listContainers()
    const found = containers.find((c) => c.name === name)

    expect(found).toBeDefined()
    expect(found?.image).toBe('redis:7-alpine')
    expect(found?.state).toBe('running')
    expect(found?.id).toEqual(expect.any(String))
    expect(found?.status).toEqual(expect.stringContaining('Up'))
  }, 20_000)

  it('stop() transitions a real container from running to exited', async () => {
    const name = await createTestContainer()
    createdNames.push(name)

    await service.stop(name)
    const containers = await service.listContainers()
    const found = containers.find((c) => c.name === name)

    expect(found?.state).toBe('exited')
  }, 20_000)

  it('start() transitions a real stopped container back to running', async () => {
    const name = await createTestContainer()
    createdNames.push(name)
    await service.stop(name)

    await service.start(name)
    const containers = await service.listContainers()
    const found = containers.find((c) => c.name === name)

    expect(found?.state).toBe('running')
  }, 20_000)

  it('restart() keeps a real container running (verified via a changed container id restart count is not tracked here, only end state)', async () => {
    const name = await createTestContainer()
    createdNames.push(name)

    await service.restart(name)
    const containers = await service.listContainers()
    const found = containers.find((c) => c.name === name)

    expect(found?.state).toBe('running')
  }, 20_000)

  it('rejects an operation on a nonexistent container with DockerCommandError rather than throwing a raw exec error', async () => {
    await expect(service.stop('no-such-container-rasik-studio')).rejects.toBeInstanceOf(DockerCommandError)
  })
})
