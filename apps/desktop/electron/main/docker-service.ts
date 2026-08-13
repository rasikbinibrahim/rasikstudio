import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { DockerContainer } from '../../src/types/docker'

const execFileAsync = promisify(execFile)

const MAX_BUFFER_BYTES = 10 * 1024 * 1024 // many containers × verbose labels can add up

export class DockerCommandError extends Error {}

interface DockerPsRecord {
  ID: string
  Names: string
  Image: string
  State: string
  Status: string
  Ports: string
  CreatedAt: string
}

/** Thin wrapper over the `docker` CLI via `execFile` — never a shell string, same rule
 *  `GitService` follows (per `phase-14-docker-integration.md`'s own "Docker CLI subprocess, not
 *  the Docker SDK" architecture, consistent with the Git CLI approach chosen in ADR 0008).
 *  Docker operates on the daemon globally, not per-workspace — unlike `GitService` this has no
 *  `cwd`/constructor state to hold. */
export class DockerService {
  private async run(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('docker', args, { maxBuffer: MAX_BUFFER_BYTES })
      return stdout
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new DockerCommandError(message)
    }
  }

  async listContainers(): Promise<DockerContainer[]> {
    const output = await this.run(['ps', '-a', '--format', '{{json .}}'])
    return output
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const record = JSON.parse(line) as DockerPsRecord
        return {
          id: record.ID,
          name: record.Names,
          image: record.Image,
          state: normalizeState(record.State),
          status: record.Status,
          ports: record.Ports,
          createdAt: record.CreatedAt,
        }
      })
  }

  async start(id: string): Promise<void> {
    await this.run(['start', id])
  }

  async stop(id: string): Promise<void> {
    await this.run(['stop', id])
  }

  async restart(id: string): Promise<void> {
    await this.run(['restart', id])
  }

  /** `-f` lets this remove a still-running container in one call (equivalent to `stop` + `rm`) —
   *  `ContainerList.tsx` gates the call behind its own confirmation dialog first, the same
   *  destructive-action pattern `FileTreeNode.tsx`'s delete confirmation already establishes, so
   *  there's no need for a separate "must stop before removing" round trip in the UI. */
  async remove(id: string): Promise<void> {
    await this.run(['rm', '-f', id])
  }
}

/** `docker ps`'s `State` field is already one of these values in practice, but it's a free-text
 *  string as far as the type system is concerned — narrowed once here rather than trusting it at
 *  every call site, with an honest `'unknown'` fallback instead of silently mis-categorizing a
 *  future Docker version's state name. */
function normalizeState(state: string): DockerContainer['state'] {
  const known: DockerContainer['state'][] = [
    'running',
    'exited',
    'paused',
    'restarting',
    'created',
    'dead',
    'removing',
  ]
  return (known as string[]).includes(state) ? (state as DockerContainer['state']) : 'unknown'
}
