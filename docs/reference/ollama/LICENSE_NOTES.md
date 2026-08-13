# Ollama — License Notes

**License:** MIT.

## Obligations

Same as VSCodium's/OpenHands' (see those folders' `LICENSE_NOTES.md`): preserve the copyright
notice and license text in any copy or substantial portion of the software.

## What this project actually did

No Ollama source was copied — Ollama is consumed exclusively as an external HTTP service (see
`ANALYSIS.md`/`API_NOTES.md`), which is not a "copy" in any license-relevant sense; calling an
HTTP API over the network creates no obligation under MIT (or any license) toward the server
software itself, only toward code actually distributed. This project does not bundle, vendor, or
redistribute the Ollama binary — the end user installs it separately.

## If this project ever bundled an Ollama binary for distribution

Would need to include Ollama's MIT copyright notice in this project's own distribution materials
(e.g. `THIRD_PARTY_NOTICES.md`) — not currently applicable since nothing is bundled; revisit only
if a future "one-click local AI setup" feature ever ships Ollama alongside this app's own
installer.
