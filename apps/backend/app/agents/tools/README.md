# apps/backend/app/agents/tools/

All agent tool implementations. Each tool is a function decorated with `@tool()` that registers it in the `ToolRegistry` with a name, description, parameter schema, and risk level.

## Files

| File | Tools | Risk Level | Built |
|---|---|---|---|
| `registry.py` | `ToolRegistry`, `@tool()` decorator, `RiskLevel` enum | — | Phase 8 |
| `file_tools.py` | `read_file`, `write_file`, `patch_file`, `delete_file`, `list_directory` | Low / Medium / High | Phase 8 |
| `search_tools.py` | `search_files`, `grep`, `search_semantic` | Low | Phase 8 |
| `shell_tools.py` | `run_command` | High | Phase 8 |
| `git_tools.py` | `get_git_status`, `git_diff` | Low | Phase 8 |
| `test_tools.py` | `run_tests` | High | Phase 8 |
| `agent_tools.py` | `create_agent` (spawn sub-agent) | High | Phase 8 |
| `browser_tools.py` | `browser_navigate` (Medium), `browser_screenshot`/`browser_get_text` (Low), `browser_click`/`browser_type` (High) | Medium / Low / High | Phase 13 |
| `lsp_tools.py` | `get_diagnostics` | Low | Phase 8 (2026-08-13) — real backend-side LSP client, Python only (`pylsp`), see `app/infrastructure/lsp/` |

## Security Requirements (all tools)

1. `read_file`, `write_file`, `patch_file`, `delete_file`: validate path is within workspace root
2. `run_command`: use `asyncio.create_subprocess_exec` with `shell=False` — never `create_subprocess_shell`
3. `browser_navigate`: validate URL against SSRF blocklist before navigation
4. All file I/O: use `aiofiles` — never synchronous `Path.read_text()`
5. All High-risk tools trigger the human approval gate before execution

Coverage target: 90% (highest in the codebase — these tools touch the file system and processes).
