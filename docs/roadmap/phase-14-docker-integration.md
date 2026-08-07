# Phase 14 — Docker Integration

**Part of:** [Implementation Roadmap](README.md)
**Depends on:** Phase 4
**Estimated effort:** 1 week

---

## Objective

Add basic Docker integration: container list, start/stop, log streaming, and basic Dockerfile editing support. This phase makes Rasik Studio useful for containerized development workflows. Kubernetes integration is out of scope for v1.0.

## Architecture

Docker integration uses the **Docker CLI subprocess** (not the Docker SDK), consistent with the Git CLI approach. The Electron main process runs Docker commands and streams output back to the renderer.

**Docker panel features:**
- List running and stopped containers
- Start/stop/restart containers
- Stream container logs in real-time
- Open a shell in a running container (connects to the user terminal)
- Dockerfile syntax highlighting (Monaco language support)

## Dependencies

- Phase 3 complete (Electron main process)
- Phase 11 complete (terminal integration for `docker exec` shell)
- Docker CLI available in PATH (system dependency)

## Files to Create

- `electron/main/docker-service.ts` — `DockerService` class (CLI subprocess)
- `electron/main/ipc/docker-handlers.ts`
- `src/features/docker/DockerPanel.tsx`
- `src/features/docker/ContainerList.tsx`
- `src/features/docker/ContainerItem.tsx`
- `src/features/docker/ContainerLogs.tsx`
- `src/store/docker-slice.ts`

## Files to Modify

- `electron/preload/index.ts` — expose `window.rasik.docker.*`
- `src/layout/LeftSidebar.tsx` — add Docker panel tab

## Acceptance Criteria

- [x] Docker panel lists all containers (running and stopped)
- [x] Start/stop container buttons work and update container status (restart also included, per the Architecture section's own "start/stop/restart" bullet)
- [x] Container log stream shows real-time output
- [x] `docker exec -it {id} /bin/sh` opens a shell in the terminal panel
- [x] Dockerfile opened in Monaco has syntax highlighting (`features/editor/language-config.ts` already mapped `dockerfile` before this phase — nothing new needed)

## Testing Strategy

- **Integration tests (manual):** Run a test container (e.g., `nginx`), start/stop via panel, stream logs
- **Done, 2026-08-06:** `docker-service.test.ts` runs against a real Docker daemon (this environment has one) — spins up a real `redis:7-alpine` container per test, verifies `listContainers()`/`start()`/`stop()`/`restart()` against real state transitions, tears the container down in `afterEach`. Same "real behavior beats a mock" standard `git-service.test.ts` set for Phase 12. `docker-log-stream.test.ts`/`docker-handlers.test.ts`/`pty-manager.test.ts` (extended) use mocked `child_process`/`electron`/`docker-service` at the manager/IPC layer, matching `pty-manager.test.ts`'s own existing standard for that layer. `docker-slice.test.ts` and `DockerPanel.test.tsx` cover the desktop store and UI. Manual click-through against a real running container (e.g. `nginx`) is still unverified — no display server in this environment, same standing gap as every other desktop feature.

## Estimated Effort

**1 week**
- Day 1–2: DockerService (CLI subprocess), IPC handlers
- Day 3–4: Docker panel UI (container list, start/stop, logs)
- Day 5: Terminal integration for `docker exec`, tests
