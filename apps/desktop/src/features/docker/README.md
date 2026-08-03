# apps/desktop/src/features/docker/

Docker container management panel: list, start, stop, restart containers, stream logs, and open a shell.

## Files (to be created in Phase 14)

| File | Purpose |
|---|---|
| `DockerPanel.tsx` | Root panel: container list |
| `ContainerList.tsx` | List of all containers (running and stopped) |
| `ContainerItem.tsx` | Single container row: name, image, status, action buttons |
| `ContainerLogs.tsx` | Real-time log stream for a selected container |
| `useDocker.ts` | Hook: polls/streams container state via IPC |

## Implementation Notes

- Docker operations use the Docker CLI subprocess (not the Docker SDK) for consistency with the Git CLI approach.
- Log streaming uses IPC events pushed from the main process, not polling.
- "Open shell" connects to `features/terminal/` by spawning a terminal tab with `docker exec -it {id} /bin/sh`.
