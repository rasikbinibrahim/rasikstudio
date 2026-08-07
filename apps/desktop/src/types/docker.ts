export interface DockerContainer {
  id: string
  name: string
  image: string
  state: 'running' | 'exited' | 'paused' | 'restarting' | 'created' | 'dead' | 'removing' | 'unknown'
  /** Human-readable Docker status string, e.g. "Up 3 hours (healthy)" or "Exited (0) 2 days ago". */
  status: string
  ports: string
  createdAt: string
}
