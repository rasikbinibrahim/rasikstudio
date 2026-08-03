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

- [ ] Docker panel lists all containers (running and stopped)
- [ ] Start/stop container buttons work and update container status
- [ ] Container log stream shows real-time output
- [ ] `docker exec -it {id} /bin/sh` opens a shell in the terminal panel
- [ ] Dockerfile opened in Monaco has syntax highlighting

## Testing Strategy

- **Integration tests (manual):** Run a test container (e.g., `nginx`), start/stop via panel, stream logs

## Estimated Effort

**1 week**
- Day 1–2: DockerService (CLI subprocess), IPC handlers
- Day 3–4: Docker panel UI (container list, start/stop, logs)
- Day 5: Terminal integration for `docker exec`, tests
