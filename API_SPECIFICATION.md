# API Specification — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03
**Base URL:** `http://localhost:8000/api/v1`
**Auth:** Bearer JWT (except `/auth/*` endpoints)

---

## 1. Authentication

### POST /auth/register
Register a new local user.

**Request:**
```json
{ "email": "user@example.com", "name": "Alice", "password": "s3cr3t!" }
```
**Response 201:**
```json
{ "access_token": "...", "refresh_token": "...", "token_type": "bearer" }
```

### POST /auth/login
```json
{ "email": "user@example.com", "password": "s3cr3t!" }
```
**Response 200:**
```json
{ "access_token": "...", "refresh_token": "...", "token_type": "bearer" }
```

### POST /auth/refresh
```json
{ "refresh_token": "..." }
```
**Response 200:**
```json
{ "access_token": "...", "refresh_token": "...", "token_type": "bearer" }
```

### POST /auth/logout
Revokes the refresh token.
```json
{ "refresh_token": "..." }
```
**Response 204:** No content.

### GET /auth/oauth/{provider}
Initiates OAuth2 flow. `provider` = `github` | `google`.
Redirects to provider authorization URL. The `state` CSRF nonce is stored server-side (Redis,
10-minute TTL) before redirecting, not just embedded in the URL.

### GET /auth/oauth/{provider}/callback?code=...&state=...
OAuth2 callback. Both `code` and `state` are required query params — `state` must match the
value `/auth/oauth/{provider}` stored (checked and consumed, single-use) or the request fails
with `401 auth_error` before any token exchange happens. Returns tokens.

### GET /auth/me
Returns current user profile.
**Response 200:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "Alice",
  "avatar_url": null,
  "created_at": "2026-08-03T00:00:00Z"
}
```

---

## 2. Workspaces

### GET /workspaces
List user's workspaces.
**Query params:** `limit=20`, `offset=0`
**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "my-project",
      "root_path": "/home/user/my-project",
      "last_opened_at": "2026-08-03T10:00:00Z",
      "created_at": "2026-08-01T00:00:00Z"
    }
  ],
  "total": 1
}
```

### POST /workspaces
```json
{ "name": "my-project", "root_path": "/home/user/my-project" }
```
**Response 201:** Workspace object.

### GET /workspaces/{workspace_id}
**Response 200:** Workspace object with `settings`.

### PATCH /workspaces/{workspace_id}
```json
{ "name": "renamed", "settings": { "default_model": "deepseek-r1:7b" } }
```
**Response 200:** Updated workspace object.

### DELETE /workspaces/{workspace_id}
**Response 204:** No content. (Deletes all related data.)

### POST /workspaces/{workspace_id}/index
Trigger RAG indexing of the workspace.
**Response 202:**
```json
{ "task_id": "uuid", "message": "Indexing started" }
```

---

## 3. Files

### GET /workspaces/{workspace_id}/files
List directory contents.
**Query params:** `path=/src` (default: workspace root)
**Response 200:**
```json
{
  "path": "/src",
  "entries": [
    { "name": "main.ts", "type": "file", "size": 1024, "modified_at": "..." },
    { "name": "components", "type": "directory" }
  ]
}
```

### GET /workspaces/{workspace_id}/files/content
Read file content.
**Query params:** `path=/src/main.ts`
**Response 200:**
```json
{ "path": "/src/main.ts", "content": "...", "language": "typescript", "encoding": "utf-8" }
```

### PUT /workspaces/{workspace_id}/files/content
Write file content.
```json
{ "path": "/src/main.ts", "content": "..." }
```
**Response 200:**
```json
{ "path": "/src/main.ts", "size": 1234, "modified_at": "..." }
```

### DELETE /workspaces/{workspace_id}/files
Delete a file or directory.
**Query params:** `path=/src/old.ts`, `recursive=false`
**Response 204:** No content.

### POST /workspaces/{workspace_id}/files/move
```json
{ "from": "/src/old.ts", "to": "/src/new.ts" }
```
**Response 200:** Updated file metadata.

---

## 4. Chat

### GET /chat/sessions
**Query params:** `workspace_id=uuid`, `limit=20`, `offset=0`
**Response 200:**
```json
{
  "items": [
    { "id": "uuid", "title": "Fix auth bug", "model": "deepseek-r1:7b", "created_at": "..." }
  ],
  "total": 5
}
```

### POST /chat/sessions
```json
{ "workspace_id": "uuid", "title": "New Chat", "model": "deepseek-r1:7b" }
```
**Response 201:** Session object.

### GET /chat/sessions/{session_id}
**Response 200:** Session object with last 50 messages.

### PATCH /chat/sessions/{session_id}
```json
{ "title": "Renamed", "model": "claude-sonnet-4-5" }
```
**Response 200:** Updated session.

### DELETE /chat/sessions/{session_id}
**Response 204:** No content.

### GET /chat/sessions/{session_id}/messages
**Query params:** `limit=50`, `before_id=uuid` (cursor pagination)
**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "role": "user",
      "content": "How does auth work?",
      "created_at": "..."
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "Auth uses JWT...",
      "token_count": 120,
      "model": "deepseek-r1:7b",
      "created_at": "..."
    }
  ],
  "has_more": false
}
```

### POST /chat/sessions/{session_id}/messages
Send a message. Response is a **Server-Sent Events** stream.
```json
{ "content": "Explain this file", "context_files": ["/src/auth.ts"] }
```
**Response 200 (SSE stream):**
```
data: {"type":"stream_start","message_id":"uuid"}

data: {"type":"stream_chunk","message_id":"uuid","delta":"Auth "}

data: {"type":"stream_chunk","message_id":"uuid","delta":"uses JWT..."}

data: {"type":"tool_call","message_id":"uuid","tool":"read_file","args":{"path":"/src/auth.ts"}}

data: {"type":"tool_result","message_id":"uuid","tool":"read_file","result":"...file content..."}

data: {"type":"stream_end","message_id":"uuid","finish_reason":"stop","usage":{"prompt_tokens":500,"completion_tokens":120}}
```

---

## 5. Agents

### GET /agents/tasks
**Query params:** `workspace_id=uuid`, `status=running`, `limit=20`, `offset=0`
**Response 200:**
```json
{
  "items": [
    {
      "id": "uuid",
      "description": "Add unit tests for auth module",
      "status": "running",
      "created_at": "..."
    }
  ],
  "total": 2
}
```

### POST /agents/tasks
```json
{
  "workspace_id": "uuid",
  "description": "Add unit tests for the auth module",
  "model": "qwen2.5:72b",
  "require_approval": true
}
```
**Response 202:**
```json
{ "task_id": "uuid", "status": "pending" }
```

### GET /agents/tasks/{task_id}
**Response 200:**
```json
{
  "id": "uuid",
  "description": "Add unit tests for auth module",
  "status": "running",
  "plan": { "steps": ["Read auth.ts", "Write tests", "Run tests"] },
  "steps": [
    {
      "index": 0,
      "tool": "read_file",
      "args": { "path": "/src/auth.ts" },
      "result": "...",
      "status": "completed",
      "started_at": "...",
      "finished_at": "..."
    }
  ],
  "result": null,
  "error": null
}
```

### POST /agents/tasks/{task_id}/approve
Approve a pending action.
```json
{ "approved": true }
```
**Response 200:** Updated task.

### POST /agents/tasks/{task_id}/cancel
**Response 200:** Task with `status: "cancelled"`.

---

## 6. Git

### GET /workspaces/{workspace_id}/git/status
**Response 200:**
```json
{
  "branch": "main",
  "ahead": 0,
  "behind": 2,
  "staged": ["/src/auth.ts"],
  "unstaged": ["/src/index.ts"],
  "untracked": ["/src/new-feature.ts"],
  "conflicts": []
}
```

### POST /workspaces/{workspace_id}/git/stage
```json
{ "paths": ["/src/auth.ts", "/src/index.ts"] }
```
**Response 200:** Updated git status.

### POST /workspaces/{workspace_id}/git/unstage
```json
{ "paths": ["/src/auth.ts"] }
```
**Response 200:** Updated git status.

### POST /workspaces/{workspace_id}/git/commit
```json
{ "message": "feat: add JWT refresh token rotation" }
```
**Response 200:**
```json
{ "sha": "abc1234", "message": "feat: add JWT refresh token rotation" }
```

### POST /workspaces/{workspace_id}/git/generate-commit-message
AI-generates a commit message from staged diff.
**Response 200:**
```json
{ "message": "feat: add JWT refresh token rotation with Redis revocation" }
```

### GET /workspaces/{workspace_id}/git/log
**Query params:** `limit=20`, `offset=0`, `branch=main`
**Response 200:** Array of commit objects.

### GET /workspaces/{workspace_id}/git/diff
**Query params:** `path=/src/auth.ts`, `staged=true`
**Response 200:**
```json
{ "path": "/src/auth.ts", "diff": "--- a/src/auth.ts\n+++ ..." }
```

### GET /workspaces/{workspace_id}/git/branches
**Response 200:**
```json
{ "current": "main", "local": ["main", "feature/auth"], "remote": ["origin/main"] }
```

### POST /workspaces/{workspace_id}/git/checkout
```json
{ "branch": "feature/auth", "create": false }
```
**Response 200:** Updated git status.

---

## 7. Search

### POST /search/semantic
Semantic code search using RAG.
```json
{
  "workspace_id": "uuid",
  "query": "how is authentication implemented",
  "top_k": 5,
  "language_filter": ["typescript", "python"]
}
```
**Response 200:**
```json
{
  "results": [
    {
      "file_path": "/src/auth.ts",
      "start_line": 10,
      "end_line": 45,
      "content": "...",
      "score": 0.92
    }
  ]
}
```

### POST /search/grep
Exact text/regex search.
```json
{
  "workspace_id": "uuid",
  "pattern": "createJWT",
  "regex": false,
  "case_sensitive": false,
  "file_pattern": "*.ts"
}
```
**Response 200:**
```json
{
  "results": [
    { "file_path": "/src/auth.ts", "line": 23, "content": "  const token = createJWT(payload);" }
  ]
}
```

---

## 8. Models

### GET /models
List all available AI models.
**Response 200:**
```json
{
  "local": [
    { "id": "deepseek-r1:7b", "name": "DeepSeek R1 7B", "provider": "ollama", "available": true }
  ],
  "cloud": [
    { "id": "claude-sonnet-4-5", "name": "Claude Sonnet 4.5", "provider": "anthropic", "available": false, "requires_key": true }
  ]
}
```

### GET /models/{model_id}/info
**Response 200:** Model details (context window, pricing, capabilities).

---

## 9. Settings

### GET /settings
**Response 200:** Full user settings object.

### PATCH /settings
```json
{ "editor.fontSize": 14, "ai.defaultModel": "deepseek-r1:7b" }
```
**Response 200:** Updated settings.

### POST /settings/api-keys
Store an encrypted API key.
```json
{ "provider": "anthropic", "key": "sk-ant-..." }
```
**Response 201:**
```json
{ "provider": "anthropic", "key_hint": "...xxxx" }
```

### DELETE /settings/api-keys/{provider}
**Response 204:** No content.

---

## 10. WebSocket

### WS /ws/{workspace_id}

Connect to the real-time event stream for a workspace. Authentication is first-message, not a
query parameter (see ADR 0005 / `AUTHENTICATION.md` §7) — a query-string JWT ends up in server
access logs and browser history, which first-message auth avoids.

**Client → Server messages:**
```json
{ "type": "auth", "token": "<jwt>" }
{ "type": "ping" }
{ "type": "agent_approve", "task_id": "uuid", "approved": true }
```

**Server → Client events:** See event table in `BACKEND_ARCHITECTURE.md` §6.

---

## 11. Error Responses

All errors follow this schema:
```json
{
  "error": {
    "code": "WORKSPACE_NOT_FOUND",
    "message": "Workspace abc123 does not exist",
    "request_id": "req_xyz"
  }
}
```

| HTTP Status | When |
|---|---|
| 400 | Validation error (invalid input) |
| 401 | Missing or invalid JWT |
| 403 | Authenticated but not authorized |
| 404 | Resource not found |
| 409 | Conflict (duplicate email, etc.) |
| 422 | Unprocessable entity (Pydantic) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
| 503 | AI model unavailable |

---

## 12. Rate Limits

| Endpoint Group | Limit |
|---|---|
| `/auth/login` | 10 req/min per IP |
| `/auth/register` | 5 req/min per IP |
| `/auth/refresh` | 20 req/min per user |
| `/auth/oauth/*/callback` | 10 req/min per IP |
| `/chat/*/messages` (streaming) | 30 req/min per user |
| `/agents/tasks` (POST) | 10 req/min per user |
| All other endpoints | 120 req/min per user |
