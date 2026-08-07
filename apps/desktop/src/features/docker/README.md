# apps/desktop/src/features/docker/

Docker container management panel: list, start, stop, restart containers, stream logs, and open a shell. Built in Phase 14.

## Files

| File | Purpose |
|---|---|
| `DockerPanel.tsx` | Root panel: header + `ContainerList` + (when a container is selected) `ContainerLogs` |
| `ContainerList.tsx` | List of all containers (running and stopped) |
| `ContainerItem.tsx` | Single container row: state dot, name/image/status, start/stop/restart/shell buttons |
| `ContainerLogs.tsx` | Real-time log stream for the selected container |

State lives in `store/docker-slice.ts` (same pattern `git-slice.ts`/`chat-slice.ts` already use) rather than a
dedicated `useDocker.ts` hook — no other component needs container state outside this feature, so a
store slice is enough; `ContainerLogs.tsx` still does its own `useEffect`-scoped IPC subscription (mirroring
`useTerminal.ts`) since that part is inherently per-mount.

## Implementation Notes

- Docker operations use the Docker CLI subprocess (`electron/main/docker-service.ts`, `execFile` — never a
  shell string) for consistency with the Git CLI approach (ADR 0008).
- Log streaming (`electron/main/docker-log-stream.ts`) spawns `docker logs -f --tail 200 {id}` and pushes
  stdout/stderr chunks over `docker:logs:data:{id}` IPC events — not polling, mirroring `PtyManager`'s
  `terminal:data:{id}` broadcast pattern.
- "Open shell" reuses `PtyManager`/`features/terminal/` rather than a second terminal implementation:
  `pty-manager.ts`'s `create()` now accepts an optional `command`/`args` override, and `docker:exec` spawns
  `docker exec -it {id} /bin/sh` through it. The returned PTY id is pushed straight into the existing
  `terminals` list, so it renders in the normal terminal tab bar.
- Dockerfile syntax highlighting needed no new code — `features/editor/language-config.ts` already maps
  `Dockerfile`/`dockerfile` to Monaco's built-in `dockerfile` language.
