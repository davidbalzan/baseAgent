# baseAgent

> An agentic application template -- streaming ReAct loop, multi-channel messaging gateway, extensible tools, and Markdown-based memory.

---

## What Is This?

**baseAgent** is a general-purpose, always-on personal assistant framework. It provides the foundational architecture for building agentic applications that connect to messaging platforms, run autonomous task loops, and persist context in human-readable files.

No domain-specific logic is included. Instead, baseAgent ships the **bones** -- you add domain skills on top.

### Key Differentiators

- **Multi-channel gateway** -- single daemon handles Telegram, Discord, and Slack via adapter plugins
- **Streaming ReAct loop** -- reason, act, observe with real-time partial output to the user
- **Resumable sessions** -- long-running tasks survive crashes and restarts (state persisted to SQLite)
- **Editable Markdown memory** -- identity (`SOUL.md`), personality (`PERSONALITY.md`), user prefs (`USER.md`), learned facts (`MEMORY.md`) are human-readable files
- **Heartbeat proactivity** -- agent wakes on a schedule and decides what to do
- **Webhook triggers** -- external systems (CI, GitHub, etc.) can trigger agent sessions via HTTP
- **Governance & rate limiting** -- per-tool permission policies and sliding-window rate limits at every layer
- **Configurable sandboxing** -- three isolation levels for shell execution (loose / medium / strict Docker)
- **Model fallback chains** -- if the primary LLM fails, automatically escalate to the next
- **Extensible skill system** -- drop a folder into `skills/`, hot-reload without restart
- **Plugin architecture** -- self-contained plugins for heartbeat, webhooks, scheduling, and more
- **Dashboard authentication** -- optional bearer token auth for all API endpoints
- **Trace replay dashboard** -- built-in web UI for inspecting sessions and tool calls

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22+ / TypeScript (ESM) |
| Package Manager | pnpm 10.x (monorepo workspaces) |
| LLM Integration | Vercel AI SDK (`ai`) |
| LLM Providers | OpenRouter, Anthropic, OpenAI, Ollama |
| Web Framework | Hono 4.x |
| Database | SQLite via Drizzle ORM + better-sqlite3 |
| Telegram | Telegraf |
| Discord | discord.js |
| Slack | @slack/bolt (Socket Mode) |
| Testing | Vitest |
| Sandbox | Docker (optional, for strict mode) |

---

## Project Structure

```
baseAgent/
├── packages/
│   ├── core/           # Agent loop, model resolution, config, schemas
│   ├── gateway/        # Channel adapters (Telegram, Discord, Slack), message queue
│   ├── memory/         # SQLite persistence (Drizzle ORM), memory file loader
│   ├── tools/          # Built-in tools, governance, executor, sandbox, skill loader
│   ├── server/         # Agent library: bootstrapAgent(), session runner, dashboard API
│   ├── plugin-heartbeat/  # Heartbeat scheduler plugin (self-contained)
│   ├── plugin-webhook/    # Webhook trigger plugin (self-contained)
│   ├── plugin-scheduler/  # Task scheduler plugin (self-contained)
│   ├── plugin-telegram/   # Telegram adapter plugin
│   ├── plugin-discord/    # Discord adapter plugin
│   ├── plugin-slack/      # Slack adapter plugin
│   ├── plugin-chat/       # Web chat adapter plugin
│   ├── plugin-docs/       # Documentation dashboard plugin
│   └── app/            # User entry point — add custom routes and integrations here
├── skills/             # User-installed tool extensions
│   ├── echo/           # Test skill — echoes messages back
│   ├── plan-phase/     # Reads phase-based task plans from docs/phases/
│   └── project-context/# Reads PRD, decisions, and roadmap docs
├── workspace/          # Agent's working directory & memory files
│   ├── SOUL.md         # Identity, boundaries, tool-use directives
│   ├── CONTEXT.md      # Situational context and environment
│   ├── PERSONALITY.md  # Voice, character, interaction style
│   ├── USER.md         # User preferences (agent-writable)
│   ├── MEMORY.md       # Accumulated context from compaction (agent-writable)
│   └── HEARTBEAT.md    # Scheduled proactive tasks (human-editable)
├── config/
│   └── default.yaml    # Runtime configuration (env vars interpolated)
├── docs/
│   ├── PRD.md          # Product Requirements Document
│   ├── DECISIONS.md    # Architectural Decision Records
│   ├── COMMANDS.md     # AI commands reference
│   └── phases/         # Phase-based task planning files
└── .env                # Environment variables (API keys, tokens)
```

---

## Core Architecture

### Agent Loop

The streaming ReAct loop (`packages/core`) drives all agent behaviour:

1. Load system prompt from workspace memory files
2. Send user input + tool definitions to the LLM via `streamText`
3. If the LLM calls a tool, execute it through the governance gate and return the result
4. Repeat until the LLM calls `finish`, hits `maxIterations`, exceeds `costCapUsd`, or times out
5. Persist the session and all trace events to SQLite

**Safety rails:** every session is bounded by iteration count (default: 35), wall-clock timeout (default: 180s), and estimated cost cap (default: $1.00).

### Model Resolution & Fallback

Supports four LLM providers out of the box: **OpenRouter**, **Anthropic**, **OpenAI**, and **Ollama**.

A fallback chain can be configured so that if the primary model errors, the next model in the list is tried automatically. Only hard errors trigger fallback -- `AbortError` (timeouts/cancellations) propagates immediately.

```yaml
llm:
  provider: openrouter
  model: google/gemini-2.0-flash-001
  fallbackModels:
    - provider: openrouter
      model: z-ai/glm-5
```

### Memory System

Six Markdown files form the agent's long-term memory:

| File | Writable by Agent | Purpose |
|------|:-:|---------|
| `SOUL.md` | No | Identity, guiding principles, tool-use directives |
| `CONTEXT.md` | No | Situational context and environment |
| `PERSONALITY.md` | No | Voice, character, interaction style |
| `USER.md` | Yes (append) | User preferences learned over time |
| `MEMORY.md` | Yes (append) | Conversation summaries from compaction |
| `HEARTBEAT.md` | No | Scheduled tasks read each heartbeat tick |

These files are loaded into the system prompt at session start, prioritised in the order above, and capped at `maxTokenBudget` (default: 8000 tokens).

**Context compaction:** when prompt tokens exceed `compactionThreshold` (default: 4000), the conversation history is summarised by the LLM and replaced with a condensed version. The summary is also persisted to `MEMORY.md`.

**Tool output decay:** large tool outputs (>500 chars) older than 3 iterations are replaced with lightweight placeholders to save context space.

---

## Built-in Tools

| Tool | Permission | Description |
|------|:----------:|-------------|
| `finish` | read | Signal task completion with a summary |
| `think` | read | Internal scratchpad for step-by-step reasoning |
| `memory_read` | read | Read any of the six workspace memory files |
| `memory_write` | write | Append timestamped entries to `USER.md` or `MEMORY.md` |
| `file_read` | read | Read workspace files with optional line-range offset/limit |
| `file_write` | write | Write or append to workspace files (auto-creates parent dirs) |
| `file_edit` | write | Exact-string-replace edit (must match uniquely) |
| `file_list` | read | List files/dirs with type indicators and sizes (recursive mode, 500 entry cap) |
| `shell_exec` | exec | Run any shell command in the workspace (filtered env, no API key leakage) |
| `web_fetch` | read | Fetch a URL; HTML converted to Markdown, JSON prettified |
| `web_search` | read | Brave Search API (requires `BRAVE_SEARCH_API_KEY`) |
| `add_mcp_server` | write | Dynamically connect an MCP server at runtime |
| `schedule_task` | write | Schedule a future agent session (plugin-scheduler) |
| `list_tasks` | read | List all scheduled tasks (plugin-scheduler) |
| `reload_skills` | write | Hot-reload skills from `skills/` without restart |

---

## Channel Adapters

All adapters support streaming output (progressive message edits), typing indicators, governance confirmations, per-user rate limiting, and user allowlists.

| Channel | Library | Max Message | Channel ID Format |
|---------|---------|:-----------:|-------------------|
| Telegram | Telegraf (long polling) | 4096 chars | `telegram:<chatId>` |
| Discord | discord.js | 2000 chars | `discord:<channelId>` |
| Slack | @slack/bolt (Socket Mode) | 4000 chars | `slack:<channelId>` |

Messages on the same channel are serialised via a per-channel FIFO queue to prevent interleaved sessions.

---

## HTTP API

All endpoints served by Hono on the configured port (default: 3000).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (status, timestamp, uptime) |
| `POST` | `/run` | Start a new agent session |
| `POST` | `/resume` | Resume a stopped session (timeout, cost_limit, or failed) |
| `POST` | `/webhook/:event` | Trigger an agent session from an external event (plugin) |
| `GET` | `/dashboard` | Trace replay web UI |
| `GET` | `/api/sessions` | List recent sessions (up to 100) |
| `GET` | `/api/sessions/:id` | Single session detail |
| `GET` | `/api/sessions/:id/traces` | All trace events for a session |
| `GET` | `/api/costs` | Aggregate cost analytics |
| `GET` | `/api/live` | SSE stream of live session events |
| `GET` | `/api/memory` | List workspace memory files with content |
| `PUT` | `/api/memory/:file` | Update a workspace memory file |
| `POST` | `/api/admin/reload-skills` | Hot-reload skills without restart |
| `GET` | `/scheduler/tasks` | List scheduled tasks (plugin) |

---

## Governance

Every tool call passes through a governance gate before execution. Each tool has a permission level (`read`, `write`, or `exec`), and each level maps to a policy:

| Policy | Behaviour |
|--------|-----------|
| `auto-allow` | Executes immediately |
| `confirm` | Sends a confirmation prompt to the user; blocks until approved or timed out (60s) |
| `deny` | Always rejected |

Per-tool overrides allow fine-grained control (e.g., `shell_exec: deny` while keeping other exec tools on `confirm`).

Heartbeat and webhook sessions run with all-`auto-allow` governance since there is no interactive user to confirm.

---

## Rate Limiting

Three independent sliding-window rate limiters protect against abuse:

| Layer | Keyed By | Default | Applied To |
|-------|----------|---------|------------|
| Channel | User ID | 10 req / 60s | Telegram, Discord, Slack message handlers |
| HTTP | Client IP | 20 req / 60s | `/run`, `/resume`, `/webhook/*` endpoints |
| Tool | Session ID | 50 req / 60s | Every tool call (after governance approval) |

---

## Sandbox

Controls how `exec`-permission tools run. Configurable globally with per-tool overrides.

| Level | Isolation |
|-------|-----------|
| `loose` | No isolation -- runs directly in-process |
| `medium` | Isolated HOME/TMPDIR, restricted PATH, resource limits via `ulimit` |
| `strict` | Docker container (read-only root, no network, `nobody` user, memory/CPU caps) |

---

## Heartbeat

When enabled, the agent wakes on a configurable interval (default: 30 min) and reads `workspace/HEARTBEAT.md` for scheduled tasks. Each tick runs a full agent session with auto-allow governance. If the output is actionable, it's forwarded to the configured channel.

```yaml
heartbeat:
  enabled: true
  intervalMs: 1800000
  channelId: "telegram:12345"
```

---

## Webhook

External systems can trigger agent sessions via `POST /webhook/:event` with a JSON payload. Supports optional HMAC-SHA256 signature verification. Actionable outputs can be routed to a messaging channel.

```yaml
webhook:
  enabled: true
  secret: ${WEBHOOK_SECRET}
  resultChannelId: "telegram:12345"
```

---

## Trace Replay Dashboard

A built-in single-page web UI at `/dashboard` for inspecting agent sessions:

- Session list with search, status badges, cost/iteration counts
- Per-session trace timeline with colour-coded phases (reason, tool_call, tool_result, governance, compaction, fallback, error)
- Iteration navigator for filtering trace events
- Keyboard navigation (j/k, arrows, /)
- Deep-link support via URL hash

---

## Skills System

Add custom tools by creating a directory under `skills/` with a `handler.ts` file:

```
skills/
└── my-skill/
    └── handler.ts    # default export: ToolDefinition or (ctx) => ToolDefinition
```

Skills are discovered and loaded at startup and can be **hot-reloaded** at runtime via the `reload_skills` tool or `POST /api/admin/reload-skills`. Failed loads are logged but don't crash the server. Loaded skills appear alongside built-in tools in the agent's tool palette.

---

## Configuration

All runtime config lives in `config/default.yaml`. Environment variables are interpolated via `${VAR_NAME}` syntax before YAML parsing. Validated at startup with Zod schemas.

### Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `OPENROUTER_API_KEY` | LLM provider (if using OpenRouter) |
| `ANTHROPIC_API_KEY` | LLM provider (if using Anthropic) |
| `OPENAI_API_KEY` | LLM provider (if using OpenAI) |
| `TELEGRAM_BOT_TOKEN` | Telegram channel adapter |
| `DISCORD_BOT_TOKEN` | Discord channel adapter |
| `SLACK_BOT_TOKEN` | Slack channel adapter |
| `SLACK_APP_TOKEN` | Slack Socket Mode |
| `BRAVE_SEARCH_API_KEY` | Web search tool |

Only the keys for providers/channels you enable are required.

---

## Getting Started

```bash
# Clone the repo
git clone git@github.com:davidbalzan/baseAgent.git
cd baseAgent

# Install dependencies
pnpm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your API keys and tokens

# Build all packages
pnpm build

# Start the agent (dev mode with hot reload)
pnpm dev

# Run tests
pnpm test
```

The server starts on `http://0.0.0.0:3000`. The trace dashboard is at `/dashboard`.

User code lives in **`packages/app/src/index.ts`** — add custom routes, middleware, and integrations there. The agent infrastructure is bootstrapped automatically via `bootstrapAgent()`.

---

## Extending the Agent

There are several clean extension points — no need to touch agent internals:

| Where | What |
|-------|------|
| `packages/plugin-*/` | Plugins — tools, adapters, routes, dashboard tabs, background services |
| `packages/app/src/index.ts` | Custom Hono routes and middleware |
| `skills/<name>/handler.ts` | New agent tools (hot-reloadable via `reload_skills`) |
| `workspace/SOUL.md` | Agent identity and hard constraints (hot-reloaded per session) |
| `workspace/CONTEXT.md` | Situational context and environment |
| `workspace/HEARTBEAT.md` | Scheduled proactive tasks |
| `config/default.yaml` | MCP servers, channels, governance, rate limits, dashboard auth |

See **[docs/CAPABILITIES.md](./docs/CAPABILITIES.md)** for a full reference covering every capability, API endpoint, and configuration field.

---

## Key Documents

| Document | Purpose |
|----------|---------|
| [docs/CAPABILITIES.md](./docs/CAPABILITIES.md) | Full capability reference (API, tools, config) |
| [docs/PLUGINS.md](./docs/PLUGINS.md) | Plugin development guide |
| [docs/PRD.md](./docs/PRD.md) | Full product requirements and phasing |
| [docs/DECISIONS.md](./docs/DECISIONS.md) | Architectural Decision Records |
| [docs/COMMANDS.md](./docs/COMMANDS.md) | AI commands reference |

---

**License**: Proprietary. All rights reserved.
