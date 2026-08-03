# AI Architecture — Rasik Studio

**Version:** 1.0.0
**Last Updated:** 2026-08-03

---

## 1. Overview

The AI layer is the core differentiator of Rasik Studio. It provides a unified, provider-agnostic interface to local and cloud language models, a multi-agent orchestration engine, a retrieval-augmented generation (RAG) pipeline, and a persistent memory system — all operating within the context of the open workspace.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Subsystem                            │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │  AI Chat UI  │   │  Inline AI   │   │  Agent Panel   │  │
│  │  (Sidebar)   │   │  (Monaco)    │   │  (Tasks)       │  │
│  └──────┬───────┘   └──────┬───────┘   └───────┬────────┘  │
│         └──────────────────▼───────────────────┘           │
│                    ┌────────────────┐                       │
│                    │  AI Gateway    │  (FastAPI WebSocket)   │
│                    └───────┬────────┘                       │
│          ┌─────────────────┼──────────────────┐            │
│          ▼                 ▼                  ▼            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Chat Service │  │Agent Service │  │ Completion Svc   │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         └─────────────────▼────────────────────┘           │
│                    ┌────────────────┐                       │
│                    │  Model Router  │                       │
│                    └───────┬────────┘                       │
│          ┌─────────────────┼──────────────────┐            │
│          ▼                 ▼                  ▼            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │    Ollama    │  │  Anthropic   │  │    OpenAI /      │  │
│  │   (Local)    │  │  (Claude)    │  │    Gemini        │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Supporting Services                     │   │
│  │  RAG Engine · Memory System · Tool Registry         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Components

### 3.1 Model Router

Provides a single interface to all AI providers.

- **Responsibilities:** Provider selection, streaming normalization, token counting, context truncation, fallback chain management.
- **See:** `MODEL_ROUTER.md` for full spec.

### 3.2 Chat Service

Manages stateful multi-turn conversations.

- Loads conversation history from PostgreSQL.
- Builds context window: system prompt + history + workspace context.
- Calls Model Router for streaming response.
- Persists messages and token counts.
- Supports tool use (function calling).

### 3.3 Agent Service

Orchestrates autonomous multi-step AI tasks.

- Accepts high-level task descriptions.
- Runs Planner → Executor → Reflector loop.
- Executes tools (file I/O, shell, browser, search).
- Emits step-by-step events over WebSocket.
- Supports human approval gates.
- **See:** `AGENT_FRAMEWORK.md` for full spec.

### 3.4 Completion Service

Provides inline code completions for the Monaco editor.

- Triggered by Monaco's `CompletionItemProvider`.
- Sends file content, cursor position, and surrounding context.
- Uses a fast, small model (e.g., Qwen 2.5 Coder 1.5B or DeepSeek Coder 1.3B) for low latency.
- Returns suggestions as Monaco `CompletionItem[]`.

### 3.5 RAG Engine

Indexes the workspace codebase for semantic search.

- **See:** `RAG_SYSTEM.md` for full spec.

### 3.6 Memory System

Persists agent and chat knowledge across sessions.

- **See:** `MEMORY_SYSTEM.md` for full spec.

### 3.7 Tool Registry

Central registry of all tools available to agents and the chat assistant. `AGENT_FRAMEWORK.md §4` is the canonical list of all 19 tools with their risk levels — this component just means every agent and the chat assistant share one registry rather than maintaining separate tool sets.

---

## 4. Context Building

When a user sends a message, the context is assembled in this order:

```
1. System Prompt
   └── Role definition, output format rules, tool schemas

2. Workspace Context (injected)
   ├── Current open file (full content if < 2000 tokens)
   ├── Recently opened files (first 100 lines each)
   ├── RAG results for the query (top-K chunks)
   └── Active terminal output (last 50 lines, if relevant)

3. Conversation History
   └── Last N messages (truncated to fit context window)

4. Current User Message
```

Token budget is managed per model — see `MODEL_ROUTER.md §7` for the canonical context-window table and truncation strategy.

---

## 5. Streaming Architecture

All AI responses are streamed end-to-end:

```
Model Provider (SSE/stream)
    → Backend: chunk accumulation
    → WebSocket: emit `stream_chunk` events
    → Frontend: append to message buffer
    → Monaco / Chat UI: render incrementally
```

See `BACKEND_ARCHITECTURE.md §6` for the canonical WebSocket event schema and the per-user/shared channel routing model.

---

## 6. Multi-Agent Orchestration

For complex tasks, multiple specialized agents collaborate:

```
User Request
    │
    ▼
Orchestrator Agent (Planner)
    ├── spawns → Coder Agent
    ├── spawns → Tester Agent
    ├── spawns → Debugger Agent
    └── spawns → Doc Writer Agent
         │
         ▼ (results)
    Orchestrator (Synthesizer)
         │
         ▼
    Human Review Gate (optional)
         │
         ▼
    Apply changes to workspace
```

Agent communication uses Redis pub/sub for real-time event distribution.

---

## 7. Model Selection Strategy

```
Feature                     Preferred Model (local)    Fallback (cloud)
────────────────────────────────────────────────────────────────────────
Inline completion           Qwen 2.5 Coder 1.5B        DeepSeek Coder API
Chat (general)              DeepSeek-R1 7B             Claude Sonnet 4
Agent task execution        Qwen 2.5 72B               Claude Opus 4
Code review / refactor      DeepSeek-R1 32B            GPT-4o
Embedding                   nomic-embed-text            text-embedding-3-small
```

User can override per feature in Settings.

---

## 8. Privacy & Data Flow

- Local models: all data stays on device; no network calls.
- Cloud models: workspace content is sent to the provider API. User must explicitly enable cloud models and accept the data policy.
- API keys: encrypted at rest with AES-256.
- No telemetry sent without explicit opt-in.

---

## 9. Error Handling

| Scenario | Behavior |
|---|---|
| Local model unavailable | Prompt user to start Ollama; offer cloud fallback |
| Cloud API rate limit | Exponential backoff with jitter (max 3 retries) |
| Context window exceeded | Truncate oldest history; notify user |
| Tool execution failure | Agent receives error result; attempts retry or alternative |
| Network timeout | Surface error in chat; allow retry |

---

## 10. Future Considerations

- Fine-tuned models on user's own codebase
- On-device model quantization (GGUF/GGML)
- Multi-modal input (image/screenshot understanding)
- Voice input/output
- Agent marketplace (share custom agents)
