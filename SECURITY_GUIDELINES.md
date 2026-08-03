# Security Guidelines — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03

---

## 1. Threat Model

Rasik Studio is a desktop IDE that connects to a local backend and optionally to cloud AI providers. The primary threats are:

| Threat | Impact | Mitigations |
|---|---|---|
| Malicious plugin | Code execution in IDE | Plugin sandbox, permission system |
| Prompt injection via workspace files | AI executes attacker-controlled commands | Output sanitization, approval gates |
| API key theft | Unauthorized AI billing charges | AES-256 encryption at rest |
| Path traversal via IPC | File system access outside workspace | Path validation on all IPC handlers |
| XSS in rendered content | Arbitrary JS in renderer | CSP, DOMPurify, contextIsolation |
| Credential interception | Auth token theft | HTTPS, short token lifetimes |
| Dependency supply chain attack | Backdoor in production build | Lockfiles, dependency audit in CI |

---

## 2. Electron Security

### 2.1 Essential Configuration

```typescript
// electron/main.ts
const win = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,     // MUST be true
    nodeIntegration: false,     // MUST be false
    sandbox: true,              // Renderer in OS sandbox
    preload: path.join(__dirname, 'preload.js'),
    webSecurity: true,          // Never disable in production
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
  },
});
```

### 2.2 Content Security Policy

```typescript
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",   // needed for Monaco
        "img-src 'self' data: blob:",
        "connect-src 'self' http://localhost:* ws://localhost:*",
        "font-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'",
      ].join('; '),
    },
  });
});
```

### 2.3 Disable Navigation to External URLs

```typescript
win.webContents.on('will-navigate', (event, url) => {
  if (!url.startsWith('file://') && !url.startsWith('http://localhost')) {
    event.preventDefault();
    shell.openExternal(url);   // Open in system browser instead
  }
});

win.webContents.setWindowOpenHandler(({ url }) => {
  shell.openExternal(url);
  return { action: 'deny' };
});
```

### 2.4 IPC Security

- All IPC channels are defined in `preload.ts` only — the renderer never accesses `ipcRenderer` directly.
- IPC handlers validate all input before acting.
- Sensitive operations (file delete, shell exec) require the workspace context to confirm scope.

---

## 3. Path Traversal Prevention

Every file system operation validates that the target path is within the workspace root:

```typescript
function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
  const normalized = path.normalize(relativePath);
  if (normalized.startsWith('..')) {
    throw new SecurityError(`Path traversal attempt: ${relativePath}`);
  }
  
  const absolute = path.resolve(workspaceRoot, normalized);
  
  // Double-check the resolved path is actually within the workspace root
  if (!absolute.startsWith(path.resolve(workspaceRoot) + path.sep)) {
    throw new SecurityError(`Path outside workspace: ${relativePath}`);
  }
  
  return absolute;
}
```

Applied in:
- File read/write IPC handlers
- Git service path arguments
- Shell CWD validation
- Agent tool implementations

---

## 4. Input Validation

### 4.1 Backend (Pydantic)

All API inputs are validated with Pydantic v2 models:

```python
class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=100_000)
    context_files: list[str] = Field(default=[], max_length=10)
    
    @field_validator('context_files')
    @classmethod
    def validate_context_files(cls, paths: list[str]) -> list[str]:
        for p in paths:
            if '..' in p or p.startswith('/'):
                raise ValueError(f'Invalid path: {p}')
        return paths
```

### 4.2 SQL Injection Prevention

SQLAlchemy ORM parameterizes all queries automatically. Raw SQL is banned in reviews:

```python
# WRONG — never do this:
await db.execute(text(f"SELECT * FROM users WHERE email = '{email}'"))

# CORRECT:
await db.execute(select(User).where(User.email == email))
```

### 4.3 Command Injection Prevention

Shell commands spawned by the application never interpolate user input directly into a shell string:

```typescript
// WRONG:
execSync(`git commit -m "${userInput}"`);

// CORRECT:
execFile('git', ['commit', '-m', userInput]);
```

In Python:
```python
# WRONG:
subprocess.run(f"git commit -m '{message}'", shell=True)

# CORRECT:
subprocess.run(['git', 'commit', '-m', message], shell=False)
```

---

## 5. Authentication Security

See `AUTHENTICATION.md` for full details. Key points:

- bcrypt password hashing (work factor 12).
- JWT access tokens expire in 30 minutes.
- Refresh token rotation on every use.
- Reuse detection: revoked token presented → all user tokens revoked.
- Auth endpoints rate-limited (10 req/min per IP).

---

## 6. Secret Management

| Secret Type | Storage | Access |
|---|---|---|
| User AI API keys | PostgreSQL, AES-256-GCM encrypted | Decrypted in memory only |
| Backend `SECRET_KEY` | Environment variable | Never in code or logs |
| Backend `ENCRYPTION_KEY` | Environment variable | Never in code or logs |
| OAuth client secrets | Environment variable | Never in code or logs |
| Database credentials | Environment variable / Docker secret | Never in code |

### Audit Checklist for Secrets

Before every PR merge, CI runs `truffleHog` to scan for accidental secret commits:

```yaml
- name: Scan for secrets
  run: trufflehog git file://. --only-verified
```

---

## 7. Prompt Injection Defense

Workspace files could contain malicious content like `"Ignore all previous instructions and..."`. Mitigations:

1. **Role separation:** File contents are injected as `assistant`-role context, not as `system`-role instructions. (Model providers treat system-role as higher authority.)
2. **Clear delimiters:** File contents are wrapped in explicit XML-like tags:
   ```
   <file path="README.md">
   ... file content ...
   </file>
   ```
3. **Agent approval gates:** High-risk actions (shell exec, file write) require human approval.
4. **Output filtering:** Agent responses are parsed for tool calls only via the model's structured tool-call mechanism — not by parsing free text.

---

## 8. Dependency Security

- Dependency lockfiles (`pnpm-lock.yaml`, `uv.lock`) committed and checked in CI.
- `pnpm audit` and `pip-audit` run in CI pipeline.
- Dependabot configured for weekly automated PR updates.
- Node.js dependencies frozen to exact versions in `package.json` for production builds.

---

## 9. Plugin Sandbox

See `PLUGIN_SYSTEM.md` §5 and §6. Key points:

- Plugins run in a separate Chromium renderer with no Node.js access.
- All plugin API calls go through an IPC bridge that enforces declared permissions.
- Plugin code is sandboxed from the main UI tree.
- Memory and CPU limits enforced per plugin.

---

## 10. Network Security

- All backend communication uses `http://localhost` in development (no external exposure).
- In production, the backend is behind HTTPS with valid TLS certificates.
- HSTS header: `Strict-Transport-Security: max-age=63072000; includeSubDomains`.
- CORS: only allows `http://localhost:5173` (dev) and `app://` (Electron production).
- WebSocket connections require a valid JWT token.
- If a web client is ever added (the desktop app does not use cookies): session cookies must set `HttpOnly`, `Secure`, and `SameSite=Strict`.

---

## 11. Data Privacy

- Workspace content sent to cloud AI providers only when the user has explicitly configured a cloud model.
- A banner is shown before sending workspace content to cloud for the first time.
- No analytics or telemetry without explicit user opt-in.
- Local data (DB, settings, memory) stored in OS user data directory, not accessible by other users.

---

## 12. Security Review Checklist (per PR)

- [ ] No secrets hardcoded or in comments
- [ ] All IPC paths validated against workspace root
- [ ] All user inputs validated with Pydantic or equivalent
- [ ] No raw SQL or string-interpolated shell commands
- [ ] New agent tools have appropriate risk levels and approval gates
- [ ] New plugin permissions follow the least-privilege principle
- [ ] `pnpm audit` and `pip-audit` pass
- [ ] CSP not weakened
- [ ] No `nodeIntegration: true` or `contextIsolation: false` introduced

---

## 13. Incident Response

If a security vulnerability is found:

1. Do NOT create a public GitHub issue.
2. Email `security@rasikstudio.dev` (placeholder for production).
3. Include: description, reproduction steps, affected versions, severity assessment.
4. Expected response: acknowledgment within 48 hours, fix within 7 days for critical issues.
