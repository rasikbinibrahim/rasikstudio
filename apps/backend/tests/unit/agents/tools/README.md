# apps/backend/tests/unit/agents/tools/

Unit tests for every agent tool. Coverage target: 90% — the highest in the codebase.

## Required Test Cases per Tool

**file_tools.py:**
- `read_file`: path within workspace succeeds, path outside raises `SecurityError`
- `write_file`: creates file, refuses path traversal attempt
- `patch_file`: applies valid unified diff, handles patch failure gracefully
- `delete_file`: deletes file, path traversal blocked

**shell_tools.py:**
- `run_command`: uses `create_subprocess_exec` with `shell=False` (verify by inspecting mock call args)
- `run_command`: shell metacharacters in command string do not enable injection

**browser_tools.py:**
- `browser_navigate`: SSRF guard blocks `http://169.254.169.254`
- `browser_navigate`: SSRF guard blocks `http://localhost:5432`
- `browser_navigate`: allows public URL `https://example.com`

**All file tools:**
- Uses `aiofiles` — synchronous `Path.read_text()` never called (verify mock)
