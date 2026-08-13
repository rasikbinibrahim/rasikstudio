# Installation

**Honest status as of Phase 16 (2026-08-11):** there is no signed, notarized installer to
download yet. Windows code signing and macOS notarization both need real
certificates/developer-account credentials this project hasn't provisioned (a cost/account
decision, not a technical gap — see `DEPLOYMENT_GUIDE.md` and `TASKS.md`). Until then, running
Rasik Studio means building it from source.

## Building from source

**Prerequisites:** Node.js 20+, pnpm 9+, Python 3.12+, [uv](https://docs.astral.sh/uv/), Docker.

```bash
git clone <repository URL>
cd rasik-studio
make install
make dev
```

See `CONTRIBUTING.md` for the full walkthrough (it's written for contributors, but the setup
steps are identical for just running the app).

## Once signed installers exist

`docs/roadmap/phase-15-deployment-pipeline.md` and `release.yml` are already built to produce
Windows (NSIS + portable), macOS (DMG + zip), and Linux (AppImage/deb/rpm) installers the moment
a `v*` tag is pushed with real signing credentials configured. This document will be updated with
real download links once that first real release happens — not before, to avoid linking to
something that doesn't exist yet.

## System requirements (as currently built and tested)

- Windows 10+, macOS 12+, or a modern Linux distribution with a working display server (X11 or
  Wayland).
- For local AI features: [Ollama](https://ollama.com) installed and running, with at least one
  model pulled (`ollama pull qwen2.5-coder:1.5b` is this project's own documented default for
  fast completions; `ollama pull deepseek-r1:7b` for chat — see `MODEL_ROUTER.md`).
- Cloud AI features (Anthropic/OpenAI/Gemini) instead of or alongside local models: an API key
  for whichever provider(s) you want, entered in Settings.
