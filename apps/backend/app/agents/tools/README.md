# apps/backend/app/agents/tools/

All agent tool implementations. Each tool is a function decorated with `@tool()` that registers it in the `ToolRegistry` with a name, description, parameter schema, and risk level.

## Files (to be created in Phase 8)

| File | Tools | Risk Level |
|---|---|---|
| `registry.py` | `ToolRegistry`, `@tool()` decorator, `RiskLevel` enum | — |
| `file_tools.py` | `read_file`, `write_file`, `patch_file`, `delete_file`, `list_directory` | Low / High |
| `search_tools.py` | `search_files`, `grep`, `search_semantic` | Low |
| `shell_tools.py` | `run_command` | High |
| `git_tools.py` | `get_git_status`, `git_diff` | Low |
| `browser_tools.py` | `browser_navigate`, `browser_screenshot`, `browser_click`, `browser_type`, `browser_get_text` | Medium / High |
| `test_tools.py` | `run_tests` | Medium |
| `agent_tools.py` | `create_agent` (spawn sub-agent) | High |
| `lsp_tools.py` | `get_diagnostics` | Low |

## Security Requirements (all tools)

1. `read_file`, `write_file`, `patch_file`, `delete_file`: validate path is within workspace root
2. `run_command`: use `asyncio.create_subprocess_exec` with `shell=False` — never `create_subprocess_shell`
3. `browser_navigate`: validate URL against SSRF blocklist before navigation
4. All file I/O: use `aiofiles` — never synchronous `Path.read_text()`
5. All High-risk tools trigger the human approval gate before execution

Coverage target: 90% (highest in the codebase — these tools touch the file system and processes).
