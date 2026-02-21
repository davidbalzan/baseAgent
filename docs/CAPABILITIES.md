# baseAgent Capabilities Reference

Comprehensive reference for all agent capabilities, APIs, and extension points.

---

## Table of Contents

1. [Agent Loop](#1-agent-loop)
2. [Memory System](#2-memory-system)
3. [Built-in Tools](#3-built-in-tools)
4. [Skills System](#4-skills-system)
5. [MCP Servers](#5-mcp-servers)
6. [Channel Adapters](#6-channel-adapters)
7. [HTTP API](#7-http-api)
8. [Governance](#8-governance)
9. [Rate Limiting](#9-rate-limiting)
10. [Sandbox](#10-sandbox)
11. [Heartbeat](#11-heartbeat)
12. [Webhook](#12-webhook)
13. [Model Configuration](#13-model-configuration)
14. [Trace & Observability](#14-trace--observability)
15. [Configuration Reference](#15-configuration-reference)
16. [Extension Points](#16-extension-points)

---

## 1. Agent Loop

### Architecture

The agent runs a streaming ReAct (Reason + Act) loop powered by the Vercel AI SDK `streamText`. Each session:

1. Loads workspace memory files into the system prompt (hot-reloaded per session)
2. Sends user input + all registered tool definitions to the LLM
3. If the LLM calls a tool, routes it through the governance gate, executes it, and returns the result
4. Repeats until the LLM calls `finish`, a limit is hit, or an error occurs
5. Persists the full session, trace events, and messages to SQLite

### Safety Limits (defaults from `config/default.yaml`)

| Limit | Default | Config Key |
|-------|---------|------------|
| Max iterations | `35` | `agent.maxIterations` |
| Wall-clock timeout | `180 000 ms` (3 min) | `agent.timeoutMs` |
| Cost cap | `$1.00 USD` | `agent.costCapUsd` |

When a limit is reached the session status is set to `timeout`, `cost_limit`, or `max_iterations` and the partial result is returned. The session can then be resumed via `POST /resume`.

### Session Status Values

| Status | Meaning |
|--------|---------|
| `running` | Active (in-flight) |
| `completed` | Finished normally via `finish` tool |
| `timeout` | Wall-clock timeout hit — resumable |
| `cost_limit` | Cost cap exceeded — resumable |
| `max_iterations` | Iteration cap hit — resumable |
| `failed` | Unhandled error — resumable |

### Context Compaction

When the prompt token count exceeds `memory.compactionThreshold` (default: 4000), the agent summarises the current conversation using the LLM and replaces the raw history with the condensed version. The summary is also appended to `MEMORY.md` — either in the per-user directory (`workspace/users/<userId>/MEMORY.md`) when available, or the shared `workspace/MEMORY.md`.

### Tool Output Decay

Large tool outputs (over `memory.toolOutputDecayThresholdChars` chars, default: 500) that are older than `memory.toolOutputDecayIterations` iterations (default: 3) are replaced with lightweight `[output truncated]` placeholders to conserve context space.

### Dynamic Tool Filtering

At the start of each session the agent scores all registered tools against the user's input and suppresses tools whose groups are not relevant. This reduces the token overhead of the tool definitions sent to the LLM. The filtering is visible in server logs:

```
[tools] Filtered 8/15 tools for session (groups: file, memory)
```

---

## 2. Memory System

### Files

Six Markdown files in `workspace/` form the agent's persistent memory. They are loaded into the system prompt on every session start, in priority order.

| File | Priority | Agent-writable | Purpose |
|------|:--------:|:-:|---------|
| `SOUL.md` | 1 | No | Identity, guiding principles, tool-use directives, hard boundaries |
| `CONTEXT.md` | 2 | No | Situational context and environment |
| `PERSONALITY.md` | 3 | No | Voice, character, communication style, response patterns |
| `USER.md` | 4 | Yes (append-only) | User preferences and context learned over time |
| `MEMORY.md` | 5 | Yes (append-only) | Long-term memories from compaction summaries |
| `HEARTBEAT.md` | 6 | No | Scheduled task definitions for proactive runs |

### Loading Order and Token Budget

Files are loaded in priority order and concatenated. Loading stops when the combined token count exceeds `memory.maxTokenBudget` (default: 8000 tokens). Earlier files (SOUL, CONTEXT, PERSONALITY) are always included; later files may be truncated.

### Per-User Memory

`USER.md` and `MEMORY.md` are flagged as per-user files. When a session has a user directory (derived from the channel's user ID), these files are resolved from `workspace/users/<userId>/` first, falling back to the shared workspace root. Compaction summaries are also written to the per-user `MEMORY.md` when a user directory is available.

### Protect Semantics

- `SOUL.md`, `CONTEXT.md`, and `PERSONALITY.md` are **read-only to the agent** — the `file_write` and `file_edit` tools will refuse to modify them.
- `USER.md` and `MEMORY.md` accept **append-only** writes from the agent via `memory_write`.
- All six files can be edited freely via the dashboard (`PUT /api/memory/:file`).

### Hot Reload

Memory files are read from disk on every session start, so edits take effect immediately without a server restart.

---

## 3. Built-in Tools

All tools are registered at startup. Each has a **permission level** that maps to the governance policy.

### `finish`
- **Permission**: read
- **Purpose**: Signal task completion. Terminates the agent loop.
- **Parameters**: `summary` (string) — the final response to the user.

### `think`
- **Permission**: read
- **Purpose**: Internal scratchpad. The agent can reason step-by-step without producing user-visible output.
- **Parameters**: `thought` (string)

### `memory_read`
- **Permission**: read
- **Purpose**: Read any of the six workspace memory files.
- **Parameters**: `file` — one of `SOUL.md`, `PERSONALITY.md`, `USER.md`, `MEMORY.md`, `HEARTBEAT.md`

### `memory_write`
- **Permission**: write
- **Purpose**: Append a timestamped entry to `USER.md` or `MEMORY.md`.
- **Parameters**: `file` (`USER.md` | `MEMORY.md`), `content` (string)

### `file_read`
- **Permission**: read
- **Purpose**: Read any file within the workspace directory. Supports line-range limiting.
- **Parameters**: `path` (string), `offset?` (number), `limit?` (number)

### `file_write`
- **Permission**: write
- **Purpose**: Write or append to a file. Auto-creates parent directories. Cannot write to `SOUL.md` or `PERSONALITY.md`.
- **Parameters**: `path` (string), `content` (string), `append?` (boolean)

### `file_edit`
- **Permission**: write
- **Purpose**: Exact-string-replace edit. The `old_string` must match exactly once in the file.
- **Parameters**: `path` (string), `old_string` (string), `new_string` (string)

### `file_list`
- **Permission**: read
- **Purpose**: List files and directories with type indicators and sizes. Capped at 500 entries.
- **Parameters**: `path?` (string, defaults to workspace root), `recursive?` (boolean)

### `shell_exec`
- **Permission**: exec
- **Purpose**: Execute a shell command in the workspace directory. Environment is filtered (no API key leakage). Isolation level controlled by sandbox config.
- **Parameters**: `command` (string), `timeout?` (number, ms)

### `web_fetch`
- **Permission**: read
- **Purpose**: Fetch a URL. HTML is converted to Markdown. JSON is prettified.
- **Parameters**: `url` (string), `maxLength?` (number, chars)

### `web_search`
- **Permission**: read
- **Purpose**: Brave Search API. Returns top results with titles, URLs, and snippets.
- **Parameters**: `query` (string), `count?` (number, default 5)
- **Requires**: `BRAVE_SEARCH_API_KEY` environment variable

### `add_mcp_server`
- **Permission**: write
- **Purpose**: Dynamically connect a new MCP server at runtime and register its tools. Also persists the server to `config/default.yaml`.
- **Parameters**: `name` (string), `command` (string), `args?` (string[]), `permission?` (`read` | `write` | `exec`), `group?` (string)

### `schedule_task`
- **Permission**: write
- **Purpose**: Schedule a task for future execution. The task runs as a full agent session at the specified time.
- **Parameters**: `task` (string), `executeAt` (ISO 8601 string), `channelId?` (string — channel to deliver results to, defaults to the current channel)
- **Provided by**: `@baseagent/plugin-scheduler`

### `list_tasks`
- **Permission**: read
- **Purpose**: List all scheduled tasks with their status.
- **Parameters**: none
- **Provided by**: `@baseagent/plugin-scheduler`

### `reload_skills`
- **Permission**: write
- **Purpose**: Hot-reload all skills from the `skills/` directory without restarting the server. Unregisters old skills and registers newly discovered ones.
- **Parameters**: none

### `install_plugin`
- **Permission**: exec
- **Purpose**: Install a plugin package from npm into the agent.
- **Parameters**: `packageName` (string)

### `list_plugins`
- **Permission**: read
- **Purpose**: List all currently loaded plugins and their status.
- **Parameters**: none

### `remove_plugin`
- **Permission**: exec
- **Purpose**: Remove an installed plugin package.
- **Parameters**: `packageName` (string)

---

## 4. Skills System

### Overview

Skills are custom tools dropped into the `skills/` directory. They are loaded at startup alongside built-in tools and can be **hot-reloaded** at runtime via the `reload_skills` tool or `POST /api/admin/reload-skills` endpoint — no server restart required. A failed skill load is logged but does not crash the server.

### Directory Layout

```
skills/
└── my-skill/
    ├── handler.ts        # Required — exports the tool definition
    └── (any other files) # Optional — helpers, data, etc.
```

### `handler.ts` API

Export a `ToolDefinition` directly, or a factory function that receives a context object:

```typescript
// Static export
import type { ToolDefinition } from "@baseagent/tools";
import { z } from "zod";

const myTool: ToolDefinition = {
  name: "my_tool",
  description: "Does something useful",
  permission: "read",
  parameters: z.object({
    input: z.string().describe("The input to process"),
  }),
  execute: async ({ input }) => {
    return `Processed: ${input}`;
  },
};

export default myTool;
```

```typescript
// Factory function (receives context with workspacePath)
export default ({ workspacePath }: { workspacePath: string }) => ({
  name: "workspace_aware",
  description: "A tool that knows the workspace path",
  permission: "read" as const,
  parameters: z.object({}),
  execute: async () => workspacePath,
});
```

### Context Object

| Property | Type | Description |
|----------|------|-------------|
| `workspacePath` | `string` | Absolute path to the `workspace/` directory |

### Skill Groups

Assign a `group` field to your `ToolDefinition` to participate in dynamic tool filtering:

```typescript
const myTool: ToolDefinition = {
  name: "my_tool",
  group: "data",
  // ...
};
```

Skills without a `group` are always included.

### Skills vs Plugins vs Built-in Tools

baseAgent has three extension mechanisms. Each serves a different scope:

| | Skills | Plugins | Built-in Tools |
|---|---|---|---|
| **Location** | `skills/<name>/handler.ts` | `packages/plugin-<name>/` | `packages/tools/src/` |
| **What it provides** | A single tool | Tools + routes + adapters + dashboard tabs + docs | Core platform tools |
| **Setup** | Drop a file, call `reload_skills` | Package + monorepo wiring + resolve-plugins entry | Hardcoded in source |
| **Config gating** | None (always loaded) | Config-driven (can return `null` from `init()`) | Always loaded |
| **Access to** | `workspacePath` | Full `PluginContext` (config, adapters, tools, logging) | Direct internal access |
| **Lifecycle hooks** | None | `init()` → `afterInit()` → `shutdown()` | None |

#### When to use a Skill

Use a skill when you need a **single tool the agent can call** — a function with inputs, outputs, and a permission level. Skills are the fastest way to extend the agent. No package.json, no monorepo wiring, no imports.

Good fit for skills:
- API integrations (weather, stock prices, notifications)
- Project-specific queries (read a plan file, query a database)
- Utilities (calculators, formatters, data transformers)
- Prototyping a tool before promoting it to a plugin

#### When to use a Plugin

Use a plugin when you need **anything beyond a single tool**:

| If you need... | Use a Plugin |
|---|---|
| A messaging channel (Telegram, Slack, web chat) | Channel adapter via `afterInit()` + `registerAdapter()` |
| HTTP endpoints (REST API, SSE, webhooks) | Hono routes via `init()` return |
| A dashboard tab | `dashboardTabs` via `init()` return |
| Background services (scheduler, heartbeat) | Long-running logic in `afterInit()` |
| Access to `handleMessage` / `queuedHandleMessage` | Only available in `PluginAfterInitContext` |
| Graceful shutdown logic | `shutdown()` lifecycle hook |
| Multiple tools that share state | Closure over shared state in the plugin factory |

#### When to use a Built-in Tool

Only for core platform functionality that every agent needs (finish, think, memory_read/write, file operations, shell_exec, web_fetch). You shouldn't need to add built-in tools unless you're extending the core platform itself.

#### Promotion path

A common pattern is to **start with a skill**, then **promote to a plugin** when it outgrows a single tool:

1. `skills/weather/handler.ts` — simple weather lookup tool
2. Needs grow: you want a dashboard tab showing weather history, an HTTP endpoint for webhooks, and background polling
3. Promote to `packages/plugin-weather/` with tools + routes + dashboard tab

See [PLUGINS.md](PLUGINS.md) for the full plugin development guide.

---

## 5. MCP Servers

### Configuration

MCP (Model Context Protocol) servers are configured in `config/default.yaml` under `mcp.servers`:

```yaml
mcp:
  servers:
    - name: my-server
      command: npx
      args: ["-y", "my-mcp-package"]
      permission: read      # Default permission for all tools from this server
      group: my-group       # Optional: for dynamic tool filtering
      toolPermissions:      # Optional: per-tool permission overrides
        dangerous_tool: exec
```

### Fields

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `name` | string | Yes | Identifier used in logs |
| `command` | string | Yes | Executable to run (e.g. `npx`, `python`) |
| `args` | string[] | No | Arguments to pass to the command |
| `env` | object | No | Extra environment variables |
| `permission` | `read\|write\|exec` | No | Default permission level (default: `read`) |
| `group` | string | No | Tool group for dynamic filtering |
| `toolPermissions` | object | No | Per-tool permission overrides |

### Runtime: `add_mcp_server` Tool

The agent can connect new MCP servers at runtime using the `add_mcp_server` tool. The connection is immediate and the server is also persisted to `config/default.yaml` so it survives restarts.

---

## 6. Channel Adapters

### Overview

All adapters share the same message handling pipeline:
1. Rate-limit check (per-user sliding window)
2. Allowlist check (if configured)
3. Queue to prevent interleaved sessions on the same channel
4. Run agent session with streaming output
5. Return final response (and stream partial updates if supported)

### Telegram

- **Library**: Telegraf (long polling or webhook mode)
- **Max message length**: 4096 chars (auto-truncated)
- **Channel ID format**: `telegram:<chatId>`
- **Streaming**: Progressive message edits during generation
- **Governance confirmations**: Supported — bot sends a prompt and waits for YES/NO reply
- **Media support**: Photo, video, audio, voice, document, sticker, animation, video note, location, contact, venue, poll, callback queries
- **Config**:

```yaml
channels:
  telegram:
    enabled: true
    token: ${TELEGRAM_BOT_TOKEN}
    allowedUserIds:       # Optional allowlist
      - "12345678"
    webhook:              # Optional webhook mode
      enabled: false
      url: "https://yourdomain.com/webhook/telegram"
      secret: "webhook_secret"
```

### Discord

- **Library**: discord.js (Gateway/WebSocket)
- **Max message length**: 2000 chars (auto-split into multiple messages)
- **Channel ID format**: `discord:<channelId>`
- **Streaming**: Progressive message edits
- **Governance confirmations**: Supported
- **Config**:

```yaml
channels:
  discord:
    enabled: true
    token: ${DISCORD_BOT_TOKEN}
    allowedUserIds:       # Optional allowlist (Discord user IDs)
      - "123456789012345678"
```

### Slack

- **Library**: @slack/bolt (Socket Mode — no public HTTP needed)
- **Max message length**: 4000 chars
- **Channel ID format**: `slack:<channelId>`
- **Streaming**: Not supported (single response posted on completion)
- **Governance confirmations**: Supported
- **Config**:

```yaml
channels:
  slack:
    enabled: true
    token: ${SLACK_BOT_TOKEN}
    appToken: ${SLACK_APP_TOKEN}
    allowedUserIds:       # Optional allowlist (Slack user IDs)
      - "U12345678"
```

### Message Queue

Each channel maintains a per-channel FIFO queue. If two messages arrive on the same channel simultaneously, the second waits for the first session to complete. This prevents interleaved agent responses.

### Conversation History

When a message arrives on a channel, the agent loads prior exchanges from that channel (keyed by `channelId`) within a configurable token budget to provide conversational continuity across sessions.

| Config Key | Default | Description |
|------------|---------|-------------|
| `memory.conversationHistoryTokenBudget` | 40000 | Global default |
| `llm.conversationHistoryTokenBudget` | (unset) | Per-model override |

---

## 7. HTTP API

All endpoints are served by Hono on `config.server.port` (default: `3000`).

### Health

#### `GET /health`

Returns server status.

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600
}
```

### Agent Sessions

#### `POST /run`

Start a new agent session.

**Request body:**
```json
{
  "input": "What is the weather today?",
  "channelId": "telegram:12345"
}
```

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `input` | string | Yes | User message / task |
| `channelId` | string | No | Channel identifier for conversation history |

**Response `200`:**
```json
{
  "sessionId": "ses_abc123",
  "output": "The weather is sunny...",
  "usage": {
    "totalTokens": 1250,
    "promptTokens": 800,
    "completionTokens": 450,
    "estimatedCostUsd": 0.0005,
    "iterations": 3
  },
  "status": "completed"
}
```

#### `POST /resume`

Resume a session that ended with `timeout`, `cost_limit`, or `failed` status.

**Request body:**
```json
{
  "sessionId": "ses_abc123",
  "input": "Continue from where you left off",
  "additionalBudgetUsd": 1.00,
  "additionalIterations": 35
}
```

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `sessionId` | string | Yes | ID of the session to resume |
| `input` | string | No | Additional user message |
| `additionalBudgetUsd` | number | No | Extra cost budget (default: `agent.costCapUsd`) |
| `additionalIterations` | number | No | Extra iteration allowance (default: `agent.maxIterations`) |

**Response `200`:**
```json
{
  "resumed": true,
  "sessionId": "ses_abc123",
  "output": "Continuing...",
  "usage": { ... },
  "status": "completed"
}
```

**Error responses**: `404` session not found, `409` session not resumable.

### Dashboard

#### `GET /dashboard`

Serves the trace replay single-page web UI (HTML).

### Dashboard API

#### `GET /api/sessions`

List recent sessions.

**Query params**: `limit` (number, max 100, default 50)

**Response:**
```json
{
  "sessions": [
    {
      "id": "ses_abc123",
      "input": "What is...",
      "output": "The answer is...",
      "status": "completed",
      "model": "google/gemini-2.0-flash-001",
      "channelId": null,
      "iterations": 3,
      "totalTokens": 1250,
      "promptTokens": 800,
      "completionTokens": 450,
      "totalCostUsd": 0.0005,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:01:00.000Z"
    }
  ]
}
```

#### `GET /api/sessions/:id`

Single session detail. Same shape as one item in the list above.

#### `GET /api/sessions/:id/traces`

All trace events for a session, sorted by timestamp.

**Response:**
```json
{
  "traces": [
    {
      "id": "tr_xyz",
      "sessionId": "ses_abc123",
      "phase": "reason",
      "iteration": 1,
      "data": { ... },
      "promptTokens": 800,
      "completionTokens": 0,
      "timestamp": "2024-01-01T00:00:01.000Z"
    }
  ]
}
```

**Trace phases**: `reason`, `tool_call`, `tool_result`, `governance`, `compaction`, `fallback`, `error`

#### `GET /api/costs`

Aggregate cost analytics across all sessions.

### Live Stream

#### `GET /api/live`

Server-Sent Events (SSE) stream of live session events. Connect from a browser or EventSource client to receive real-time updates as sessions run.

**Event types:**

| Event | Data |
|-------|------|
| `ping` | `{}` or `{ ts: "..." }` — keep-alive |
| `session_started` | `{ sessionId, channelId?, input, ts }` |
| `trace_event` | `{ sessionId, phase, iteration, data, promptTokens?, completionTokens?, ts }` |
| `session_completed` | `{ sessionId, status, ts }` |

Keep-alive pings are sent every 20 seconds.

### Memory Files

#### `GET /api/memory`

List all six workspace memory files with their content.

**Response:**
```json
{
  "files": [
    {
      "name": "SOUL.md",
      "label": "Soul",
      "description": "Core identity, name, values",
      "exists": true,
      "content": "# Soul\n..."
    }
  ]
}
```

#### `PUT /api/memory/:file`

Overwrite a memory file. Only the six known filenames are accepted (no path traversal).

**`:file`**: One of `SOUL.md`, `CONTEXT.md`, `PERSONALITY.md`, `USER.md`, `MEMORY.md`, `HEARTBEAT.md`

**Request body:**
```json
{ "content": "# Soul\nYou are..." }
```

**Response `200`:**
```json
{ "ok": true, "bytes": 512 }
```

**Error responses**: `403` unknown/disallowed file, `400` missing content, `500` write error.

### Dashboard Authentication

When `dashboard.secret` is configured, all `/api/*` routes require a bearer token:

```
Authorization: Bearer <secret>
```

Requests without a valid token receive `401 Unauthorized`. When no secret is configured, all endpoints are open (suitable for local development).

### Admin Endpoints

#### `POST /api/admin/reload-skills`

Hot-reload all skills from the `skills/` directory. Unregisters old skills and registers newly discovered ones. No server restart required.

**Response `200`:**
```json
{ "ok": true, "message": "Skills reloaded successfully" }
```

### Plugin Routes

Plugins can provide their own HTTP endpoints via `routes` (a Hono sub-app) and `routePrefix`. These are mounted on the main server automatically during bootstrap.

#### `GET /scheduler/tasks` (plugin-scheduler)

Returns all scheduled tasks sorted by creation date (newest first).

**Response:**
```json
{
  "tasks": [
    {
      "id": "a1b2c3d4-...",
      "task": "Check API health and report",
      "executeAt": "2026-02-20T15:00:00.000Z",
      "channelId": "telegram:12345",
      "createdAt": "2026-02-20T10:30:00.000Z",
      "status": "pending"
    }
  ]
}
```

**Task status values:** `pending`, `running`, `completed`, `failed`

### Webhook

#### `POST /webhook/:event`

Trigger an agent session from an external system (CI, GitHub, monitoring, etc.). See [Section 12](#12-webhook) for full details.

---

## 8. Governance

### Overview

Every tool call passes through a governance gate before execution. The gate checks the tool's permission level against the configured policy for that level.

### Permission Levels

| Level | Tools |
|-------|-------|
| `read` | `file_read`, `file_list`, `memory_read`, `web_fetch`, `web_search`, `finish`, `think`, `list_tasks`, `list_plugins` |
| `write` | `file_write`, `file_edit`, `memory_write`, `add_mcp_server`, `schedule_task`, `reload_skills` |
| `exec` | `shell_exec`, `install_plugin`, `remove_plugin` |

### Policies

| Policy | Behaviour |
|--------|-----------|
| `auto-allow` | Executes immediately without prompting |
| `confirm` | Sends a confirmation prompt to the user via the channel adapter; blocks until YES/NO (60s timeout) |
| `deny` | Always rejected; tool call fails |

### Configuration

```yaml
governance:
  read: auto-allow    # Policy for read-permission tools
  write: confirm      # Policy for write-permission tools
  exec: auto-allow    # Policy for exec-permission tools
  toolOverrides:      # Per-tool overrides (take precedence over level policy)
    memory_write: auto-allow
    shell_exec: deny
```

### Heartbeat and Webhook Governance

Heartbeat and webhook sessions run with all-`auto-allow` governance because there is no interactive user to confirm tool calls.

### Confirmation Flow (channel adapters)

When a `confirm` policy is triggered:
1. The adapter sends a formatted prompt to the user: tool name, permission level, and argument summary
2. The session blocks waiting for a YES or NO reply (60-second timeout)
3. YES → tool executes; NO → tool is denied with a reason

---

## 9. Rate Limiting

### Three Independent Layers

| Layer | Keyed By | Default | Applied To |
|-------|----------|---------|------------|
| Channel | User ID | 10 req / 60s | Telegram, Discord, Slack message handlers |
| HTTP | Client IP | 20 req / 60s | `/run`, `/resume`, `/webhook/*` |
| Tool | Session ID | 50 calls / 60s | Every tool call (after governance approval) |

### Algorithm

Sliding window counter. Each layer maintains a timestamped ring buffer of requests. Requests older than `windowMs` are evicted before checking the count.

### Configuration

```yaml
rateLimit:
  channel:
    maxRequests: 10
    windowMs: 60000       # 10 messages/min per user
  http:
    maxRequests: 20
    windowMs: 60000       # 20 requests/min per IP
  tool:
    maxRequests: 50
    windowMs: 60000       # 50 tool calls/min per session
```

Any layer can be omitted to disable that limiter entirely.

### HTTP Rate Limit Response

When the HTTP limiter triggers, the endpoint returns:
```json
HTTP 429 Too Many Requests
{ "error": "Rate limit exceeded" }
```

---

## 10. Sandbox

### Overview

Controls how `shell_exec` (and other `exec`-permission tools) run. Three isolation levels.

### Levels

| Level | Isolation | Requirements |
|-------|-----------|-------------|
| `loose` | No isolation — runs in the host process with filtered env | None |
| `medium` | Isolated HOME/TMPDIR, restricted PATH, resource limits via `ulimit` | None |
| `strict` | Docker container: read-only root, no network, `nobody` user, memory/CPU caps | Docker |

### Configuration

```yaml
sandbox:
  defaultLevel: medium       # loose | medium | strict
  dockerImage: alpine:3.19   # Used for strict level
  maxMemoryMb: 256
  cpuCount: 0.5
  toolOverrides:             # Per-tool level overrides
    shell_exec: strict
```

### Docker Requirements (strict mode)

- Docker daemon must be running
- The configured `dockerImage` must be pullable
- If Docker is unavailable at startup when `strict` is configured, a warning is logged but the server continues

---

## 11. Heartbeat

### Overview

The heartbeat is a **self-contained plugin** (`@baseagent/plugin-heartbeat`). When enabled, the agent wakes on a configurable schedule and reads `workspace/HEARTBEAT.md` for task definitions. Each tick runs a full agent session with auto-allow governance via the plugin's own session runner (`createSessionRunner()`). If the session produces actionable output, it is forwarded to the configured channel. The plugin manages its own lifecycle — starting the scheduler in `afterInit()` and stopping it in `shutdown()`.

### Configuration

```yaml
heartbeat:
  enabled: true
  intervalMs: 1800000        # 30 minutes (default)
  channelId: "telegram:12345"  # Where to send proactive messages
```

### HEARTBEAT.md Format

Write tasks in Markdown. The agent reads the file and decides what (if anything) to do proactively:

```markdown
# Heartbeat Tasks

## Daily Briefing
Every morning, check for new GitHub issues, unread emails, and summarise overnight events.

## Monitoring
Check that the main API endpoint is responding. Alert if it returns non-200.
```

The agent uses its full tool palette during heartbeat sessions. Results forwarded to the channel are only sent if the output is non-empty and non-trivial.

---

## 12. Webhook

### Overview

The webhook is a **self-contained plugin** (`@baseagent/plugin-webhook`). External systems can trigger agent sessions via HTTP. Supports optional HMAC-SHA256 signature verification. Results can be routed to a messaging channel. The plugin returns its Hono route from `init()` and wires the session runner in `afterInit()` using a proxy app pattern.

### Endpoint

```
POST /webhook/:event
```

`:event` is a free-form label (e.g. `github`, `ci-failure`, `deployment`).

### Request Payload

```json
{
  "input": "A deployment just completed for version 1.2.3",
  "channelId": "telegram:12345",
  "metadata": { "version": "1.2.3", "env": "production" }
}
```

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `input` | string | Yes | Task description for the agent |
| `channelId` | string | No | Override the result channel for this request |
| `metadata` | object | No | Extra context passed to the agent in the system prompt |

### HMAC Signature Verification

When `webhook.secret` is configured, each request must include a signature header:

```
X-Webhook-Signature: sha256=<hex-digest>
```

The digest is computed as `HMAC-SHA256(secret, raw-body)`. Requests with missing or invalid signatures are rejected with `401`.

### Configuration

```yaml
webhook:
  enabled: true
  secret: ${WEBHOOK_SECRET}          # Optional HMAC secret
  resultChannelId: "telegram:12345"  # Default result channel
```

### Response

```json
{
  "sessionId": "ses_abc123",
  "output": "Deployment looks good...",
  "status": "completed"
}
```

---

## 13. Model Configuration

### Supported Providers

| Provider | ID | Auth |
|----------|----|------|
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` |
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Ollama | `ollama` | (none — local) |

### Configuration

```yaml
llm:
  provider: openrouter
  model: google/gemini-2.0-flash-001
  apiKey: ${OPENROUTER_API_KEY}
  costPerMInputTokens: 0.10    # USD per 1M input tokens
  costPerMOutputTokens: 0.40   # USD per 1M output tokens
  conversationHistoryTokenBudget: 80000  # Optional per-model override

  providers:                   # Provider-specific overrides
    anthropic:
      apiKey: ${ANTHROPIC_API_KEY}
    openai:
      apiKey: ${OPENAI_API_KEY}
    ollama:
      baseUrl: http://localhost:11434
```

### Fallback Chain

If the primary model returns a hard error (not a timeout/cancellation), the agent automatically retries with the next model in `fallbackModels`:

```yaml
llm:
  provider: openrouter
  model: google/gemini-2.0-flash-001
  fallbackModels:
    - provider: openrouter
      model: z-ai/glm-5
    - provider: anthropic
      model: claude-3-5-haiku-20241022
```

`AbortError` (timeouts, user cancellations) propagates immediately without triggering the fallback chain.

### Live Pricing (OpenRouter)

At startup, when using OpenRouter, the agent fetches live pricing for the configured model from the OpenRouter API. This takes precedence over `costPerMInputTokens`/`costPerMOutputTokens` in the config. If the fetch fails, the config values are used as a fallback.

---

## 14. Trace & Observability

### Trace Phases

Every step of an agent session emits a trace event persisted to SQLite:

| Phase | Emitted When |
|-------|-------------|
| `reason` | LLM produces text output (thinking / narrating) |
| `tool_call` | LLM requests a tool execution |
| `tool_result` | Tool execution completes (success or error) |
| `governance` | Confirmation prompt sent or tool denied |
| `compaction` | Context compaction triggered |
| `fallback` | Model fallback chain activated |
| `error` | Unhandled error in the loop |

### Dashboard

The built-in single-page web UI at `GET /dashboard` provides:

- Session list with search, status badges, cost/iteration counts
- Per-session trace timeline with colour-coded phase indicators
- Iteration navigator for filtering trace events by loop iteration
- Deep-link support via URL hash (`#ses_abc123`)
- Keyboard navigation: `j`/`k` or arrow keys to move, `/` to search

### Plugin Tabs

Plugins can contribute dashboard tabs via the `DashboardTab` type on `PluginCapabilities`. Plugin tabs appear in the nav bar after the built-in tabs and are only visible when the contributing plugin is loaded.

Each tab declares:

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `id` | string | Yes | Unique key used in CSS class names and tab switching |
| `label` | string | Yes | Display label in the nav bar |
| `panelHtml` | string | Yes | HTML markup — root element **must** use class `{id}-panel` |
| `css` | string | No | Additional CSS rules |
| `js` | string | No | JS code (function definitions, state) |
| `onActivate` | string | No | JS expression called once on first tab activation |

Keyboard shortcuts `5`–`9` are auto-assigned to plugin tabs in registration order.

Currently registered plugin tabs:

| Plugin | Tab ID | Label | Data Endpoint |
|--------|--------|-------|---------------|
| `@baseagent/plugin-scheduler` | `tasks` | Tasks | `GET /scheduler/tasks` |

### Live SSE Stream

`GET /api/live` provides a real-time SSE feed of all session events. The dashboard uses this to update without polling. Third-party tools can subscribe to it for custom monitoring.

### Markdown Trace Export

After each session, a Markdown trace file is written to `traces/<sessionId>.md` at the repo root. This provides a human-readable record of every iteration, tool call, and token usage.

---

## 15. Configuration Reference

Full field list for `config/default.yaml`. All fields are optional unless marked required.

### `llm`

| Field | Type | Required | Default | Description |
|-------|------|:--------:|---------|-------------|
| `provider` | string | Yes | — | `openrouter` \| `anthropic` \| `openai` \| `ollama` |
| `model` | string | Yes | — | Model ID (provider-specific) |
| `apiKey` | string | Depends | — | API key (not needed for Ollama) |
| `costPerMInputTokens` | number | No | — | USD per 1M input tokens |
| `costPerMOutputTokens` | number | No | — | USD per 1M output tokens |
| `conversationHistoryTokenBudget` | number | No | — | Per-model token budget for history (overrides `memory` default) |
| `fallbackModels` | array | No | `[]` | Fallback model chain |
| `providers` | object | No | — | Provider-specific overrides (apiKey, baseUrl) |

### `agent`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxIterations` | number | `35` | Max ReAct loop iterations per session |
| `timeoutMs` | number | `180000` | Wall-clock timeout per session (ms) |
| `costCapUsd` | number | `1.00` | Max estimated cost per session (USD) |

### `memory`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxTokenBudget` | number | `8000` | Max tokens for memory files in system prompt |
| `compactionThreshold` | number | `4000` | Prompt token count that triggers compaction |
| `toolOutputDecayIterations` | number | `3` | Iterations before large tool outputs are replaced |
| `toolOutputDecayThresholdChars` | number | `500` | Character count threshold for tool output decay |
| `conversationHistoryTokenBudget` | number | `40000` | Default token budget for conversation history |

### `server`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | number | `3000` | HTTP server port |
| `host` | string | `0.0.0.0` | HTTP server host/interface |

### `channels`

See [Section 6](#6-channel-adapters) for per-channel fields.

### `governance`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `read` | string | `auto-allow` | Policy for read-permission tools |
| `write` | string | `confirm` | Policy for write-permission tools |
| `exec` | string | `confirm` | Policy for exec-permission tools |
| `toolOverrides` | object | `{}` | Per-tool policy overrides |

### `rateLimit`

Each of `channel`, `http`, and `tool` accepts:

| Field | Type | Description |
|-------|------|-------------|
| `maxRequests` | number | Max requests in the window |
| `windowMs` | number | Window size in milliseconds |

### `sandbox`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `defaultLevel` | string | `loose` | `loose` \| `medium` \| `strict` |
| `dockerImage` | string | `alpine:3.19` | Docker image for strict level |
| `maxMemoryMb` | number | `256` | Memory limit for Docker container |
| `cpuCount` | number | `0.5` | CPU limit for Docker container |
| `toolOverrides` | object | `{}` | Per-tool sandbox level overrides |

### `heartbeat`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable the heartbeat scheduler |
| `intervalMs` | number | `1800000` | Tick interval (ms) |
| `channelId` | string | — | Channel to send proactive messages |

### `webhook`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable the webhook endpoint |
| `secret` | string | — | HMAC-SHA256 signing secret |
| `resultChannelId` | string | — | Default channel for webhook results |

### `dashboard`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `secret` | string | — | Bearer token for dashboard API authentication. When set, all `/api/*` routes require `Authorization: Bearer <secret>`. When unset, endpoints are open. |

### `mcp`

| Field | Type | Description |
|-------|------|-------------|
| `servers` | array | List of MCP server configurations (see [Section 5](#5-mcp-servers)) |

---

## 16. Extension Points

### Where to Add Your Code

| Location | What to put there |
|----------|-------------------|
| `packages/plugin-*/` | Plugins — tools, adapters, routes, dashboard tabs |
| `packages/app/src/index.ts` | Custom Hono routes, middleware, startup logic |
| `skills/<name>/handler.ts` | Custom agent tools |
| `workspace/SOUL.md` | Agent identity, name, hard constraints |
| `workspace/PERSONALITY.md` | Communication style, tone |
| `workspace/HEARTBEAT.md` | Scheduled proactive tasks |
| `config/default.yaml` | MCP servers, governance, rate limits, channels |

### Adding a Custom HTTP Route

Edit `packages/app/src/index.ts` after `bootstrapAgent()` returns:

```typescript
const { app, config, shutdown } = await bootstrapAgent(...);

// Add your routes here
app.get("/my-status", (c) => c.json({ status: "ok", version: "1.0" }));

app.post("/trigger", async (c) => {
  const { task } = await c.req.json();
  // sessionDeps is not returned by bootstrapAgent by default —
  // expose it if needed, or use POST /run instead
  return c.json({ received: task });
});
```

### Adding a Custom Tool (Skill)

```bash
mkdir skills/my-tool
cat > skills/my-tool/handler.ts << 'EOF'
import { z } from "zod";

export default {
  name: "my_tool",
  description: "Brief description of what this tool does",
  permission: "read" as const,
  parameters: z.object({
    query: z.string().describe("Input to process"),
  }),
  execute: async ({ query }: { query: string }) => {
    return `Result for: ${query}`;
  },
};
EOF
```

Call the `reload_skills` tool (or `POST /api/admin/reload-skills`) to load it immediately without a server restart.

### Connecting an MCP Server

Either add to `config/default.yaml`:

```yaml
mcp:
  servers:
    - name: my-server
      command: npx
      args: ["-y", "my-mcp-package"]
      permission: read
```

Or ask the agent at runtime: *"Connect the `my-server` MCP server using `npx -y my-mcp-package`"* — the `add_mcp_server` tool will connect it and persist the config.

### Adding a Dashboard Tab (Plugin)

Plugins can contribute dashboard tabs by returning `dashboardTabs` from `init()`. The tab is only visible when the plugin is loaded.

**1. Define the tab** in your plugin package:

```typescript
// packages/plugin-myplugin/src/dashboard-tab.ts
import type { DashboardTab } from "@baseagent/core";

export const myDashboardTab: DashboardTab = {
  id: "myplugin",                    // Used in CSS class: .myplugin-panel
  label: "My Plugin",                // Nav bar label
  onActivate: "loadMyPluginData()",  // Called once on first tab click

  css: `
.myplugin-panel { flex-direction: column; padding: 20px; }
.myplugin-title { font-size: 14px; font-weight: 600; }
`,

  panelHtml: `
<section class="myplugin-panel" id="myplugin-panel">
  <div class="myplugin-title">My Plugin Dashboard</div>
  <div id="myplugin-content"></div>
</section>
`,

  js: `
async function loadMyPluginData() {
  var el = document.getElementById('myplugin-content');
  if (!el) return;
  try {
    var data = await fetchJSON('/myplugin/data');
    el.textContent = JSON.stringify(data, null, 2);
  } catch (e) {
    el.textContent = 'Failed to load: ' + e.message;
  }
}
`,
};
```

**2. Return it from `init()`** alongside optional routes:

```typescript
import { Hono } from "hono";
import { myDashboardTab } from "./dashboard-tab.js";

export function createMyPlugin(): Plugin {
  return {
    name: "myplugin",
    phase: "services",
    async init(ctx) {
      const app = new Hono();
      app.get("/data", (c) => c.json({ hello: "world" }));

      return {
        routes: app,
        routePrefix: "/myplugin",
        dashboardTabs: [myDashboardTab],
      };
    },
  };
}
```

**Conventions:**
- The `panelHtml` root element **must** use CSS class `{id}-panel` for show/hide to work
- Use `fetchJSON()` and `escapeHtml()` — they are provided by the host dashboard
- Tab JS runs in the global scope; prefix functions/variables to avoid collisions
- Use `onActivate` for lazy loading to avoid fetching data for tabs the user may never open

See [ADR-008](DECISIONS.md#adr-008-plugin-dashboard-extension-system) for the architectural decision behind this system.

### Customising the Agent's Identity

Edit `workspace/SOUL.md` to change the agent's name, principles, and constraints. Changes take effect on the next session (no restart needed).

For deeper references, see:
- `docs/PLUGINS.md` — plugin development guide
- `docs/DECISIONS.md` — architectural decisions
- `docs/PRD.md` — product requirements
- `docs/COMMANDS.md` — AI command reference
