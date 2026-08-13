# Plugin Permissions

> Planned design — see `GETTING_STARTED.md`'s banner. Mirrors `PLUGIN_SYSTEM.md` §5 exactly.

Every permission a plugin needs must be declared up front in its manifest's `permissions` array
(see `MANIFEST_REFERENCE.md`). The user is prompted to approve them at install time. **Plugins
cannot request additional permissions at runtime** — an API call outside what was declared and
approved returns an error, silently, rather than prompting or throwing.

| Permission | Access Granted |
|---|---|
| `workspace.read` | Read files in the current workspace |
| `workspace.write` | Write files in the current workspace |
| `workspace.shell` | Execute shell commands — high-risk, shows a prominent warning at install time |
| `network.fetch` | Make HTTP requests to any external URL |
| `network.fetch:own` | Make HTTP requests only to hosts listed in the manifest's `contributes.allowedHosts` |
| `ai.chat` | Call the AI chat API (`api.ai.chat`/`.stream`/`.embed`) |
| `settings.read` | Read user settings |
| `settings.write` | Write user settings |
| `editor.read` | Read editor content and selection |
| `editor.write` | Modify editor content |

## Design intent

- **Least privilege by default** — a plugin that only needs to read the active file's selection
  (like `GETTING_STARTED.md`'s Hello World example) declares `editor.read`, not `editor.write` or
  `workspace.read`.
- **`workspace.shell` is deliberately called out as high-risk** in the design, matching this
  project's own agent-tool risk-tiering philosophy (`AGENT_FRAMEWORK.md`'s risk levels for
  `run_command`/`write_file`) — a plugin that can execute arbitrary shell commands is treated with
  the same seriousness as an AI agent doing the same.
- **`network.fetch:own`** exists specifically so a plugin author can prove (via the manifest,
  reviewable before install) exactly which external hosts their plugin talks to, rather than
  requiring the broad `network.fetch` grant for a plugin that only ever calls one API.
