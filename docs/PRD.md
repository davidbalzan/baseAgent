# Product Requirements Document: baseAgent

**Project:** baseAgent — Agentic Application Template
**Repository:** [github.com/davidbalzan/baseAgent](https://github.com/davidbalzan/baseAgent)
**Version:** 1.0 Draft
**Date:** 2026-02-18
**Author:** David Balzan
**Status:** Draft

---

## Table of Contents

1. [Overview](#1-overview)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [Target Users](#3-target-users)
4. [Architecture Principles](#4-architecture-principles)
5. [v1.0 — Core Foundations](#5-v10--core-foundations)
6. [v1.1–v1.2 — High-Priority Improvements](#6-v11v12--high-priority-improvements)
7. [v2+ — Nice-to-Haves & Extensions](#7-v2--nice-to-haves--extensions)
8. [Technical Constraints & Decisions](#8-technical-constraints--decisions)
9. [Success Metrics](#9-success-metrics)
10. [Risks & Mitigations](#10-risks--mitigations)
11. [Milestones & Phasing](#11-milestones--phasing)

---

## 1. Overview

### 1.1 What Is This?

**baseAgent** is a general-purpose, always-on personal-assistant template — a daemon that connects to multiple messaging platforms, runs a streaming ReAct-style agent loop, persists memory in editable Markdown files, and exposes an extensible tool system. It ships with no domain-specific logic; instead it provides the **bones** needed to feel like a capable AI companion out of the box.

The project includes built-in AI workflow skills (`/start-session`, `/remember`, `/plan-phase`, etc.), phase-based planning, and persistent knowledge capture across projects.

### 1.2 Why Does This Exist?

Existing frameworks (LangGraph, Auto-GPT, CrewAI) optimize for batch pipelines or developer APIs. None offer:

- **Messaging-native multi-channel gateway** as a first-class citizen.
- **Editable Markdown memory** (personality, user prefs, agent instructions) that non-developers can tweak.
- **Heartbeat proactivity** — the agent wakes on a schedule and decides what to do.
- **Resumability** — long tasks survive crashes and restarts.
- **Streaming UX** — partial reasoning, tool progress, and final replies feel live.
- **Built-in development methodology** — structured planning, ADRs, and cross-IDE AI commands from day one.

baseAgent combines these into a template that is immediately useful as a daily driver while being a solid base for any vertical specialization.

### 1.3 Design Philosophy

> **Generality first, specialization later.** Ship the loop, the gateway, the tools, and the memory. Domain skills (GitHub, Jira, finance) are installed afterward — never baked in.
>
> **Documentation as code.** Every architectural decision, phase plan, and learned pattern is tracked in Markdown — human-readable, version-controlled, and AI-context-friendly.

---

## 2. Goals & Non-Goals

### 2.1 Goals

| ID | Goal | Success Criteria |
|----|------|-----------------|
| G1 | Provide a production-ready agent loop with streaming and resumability | Loop completes 95%+ of tasks within configured iteration/timeout limits; survives process restart mid-task |
| G2 | Unify messaging across multiple platforms behind a single daemon | Telegram, Discord, Slack adapters functional with <2s message delivery; adapter interface supports adding more |
| G3 | Offer human-readable, editable memory and persona files | Users can modify `SOUL.md`, `USER.md` etc. and see behavior changes on next interaction |
| G4 | Ship 8–12 general-purpose tool primitives | File I/O, shell, browser, web search, calendar, email, image analysis, code interpreter all functional |
| G5 | Enable proactive behavior via heartbeat and triggers | Agent wakes on schedule, reads checklist, and acts or reports "all good" |
| G6 | Make skill extension trivial | New tool = drop a folder with schema + handler; no core code changes |

### 2.2 Non-Goals (v1)

| ID | Non-Goal | Rationale |
|----|----------|-----------|
| NG1 | Domain-specific tools (GitHub, Jira, trading) | Added as skills post-v1 |
| NG2 | Multi-user / team workspaces | Single-user personal assistant first |
| NG3 | Full web dashboard UI | CLI + messaging channels are the v1 interface |
| NG4 | Voice I/O | Extension-layer concern, not core |
| NG5 | Self-hosting marketplace | Community extensions are a v2+ concern |

---

## 3. Target Users

### 3.1 Primary Persona — "Power User / Solo Dev"

- Comfortable with CLI and config files.
- Wants a personal AI assistant across all their messaging apps.
- Values transparency (readable memory, trace logs) over black-box magic.
- Will extend with custom tools for their own workflows.

### 3.2 Secondary Persona — "Non-Technical Daily Driver"

- Interacts exclusively via messaging apps (WhatsApp, Telegram).
- Edits Markdown files occasionally for persona tweaks.
- Relies on pre-installed skills; does not write code.

---

## 4. Architecture Principles

| Principle | Implication |
|-----------|-------------|
| **Modular monorepo** | Single repo, clear package boundaries (`core/`, `gateway/`, `tools/`, `memory/`, `skills/`) |
| **AI-context friendly** | Small, focused files; clear naming; minimal indirection; token-efficient prompts |
| **Streaming-first** | Every layer (loop, gateway, tools) supports partial output |
| **Resumable by default** | Loop state persisted to SQLite; tools report idempotency |
| **Convention over configuration** | Sensible defaults; override via Markdown/YAML files |
| **Adapter pattern for I/O** | Channels, LLM providers, and tools share common interfaces |
| **Latest stable dependencies** | Target Node.js 22 LTS; Tailwind for any web UI |

---

## 5. v1.0 — Core Foundations

> **Milestone name:** Empty Template
> **Scope:** Everything needed to feel like a capable personal assistant — no domain-specific tools.

---

### 5.1 Streaming-Capable Agent Loop

#### 5.1.1 Description

A clean, resumable ReAct-style loop: **Reason → Tool Calls → Observe → Repeat**. The loop streams partial reasoning, tool progress, and final replies to make the experience feel responsive and live.

#### 5.1.2 Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| AL-1 | Implement ReAct loop with structured output (reason/act/observe phases) | P0 | Model outputs structured JSON for tool calls |
| AL-2 | Stream partial reasoning tokens to the active channel in real time | P0 | Configurable: full stream vs. summary-only |
| AL-3 | Configurable max iterations | P0 | Default: 15–20 per task |
| AL-4 | Configurable timeout per task | P0 | Default: 600 seconds |
| AL-5 | Configurable cost cap per task | P1 | Abort if estimated token cost exceeds threshold |
| AL-6 | Dynamic stopping — model decides "done" via structured output or special `finish` tool | P0 | Avoids wasted iterations |
| AL-7 | Persist loop state (pending tools, context delta, iteration count) to SQLite | P0 | Enables resumability |
| AL-8 | Resume interrupted tasks on process restart | P0 | Detect incomplete sessions on startup, prompt user to resume or discard |
| AL-9 | Support parallel tool calls within a single iteration | P1 | When tools are independent |
| AL-10 | Emit structured trace events for every phase (reason, tool_call, observe, finish) | P0 | Consumed by observability layer |

#### 5.1.3 Acceptance Criteria

- Loop completes a multi-step task (e.g., "search web, summarize, save to file") within iteration/timeout limits.
- Killing the process mid-task and restarting resumes from the last completed tool call.
- Streaming output appears in the messaging channel within 500ms of generation.

---

### 5.2 Multi-Channel Gateway

#### 5.2.1 Description

A single long-lived daemon process that handles inbound/outbound messages across Telegram, Discord, Slack, and additional platforms via a unified adapter interface. The messaging-native gateway is baseAgent's primary differentiator.

#### 5.2.2 Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| GW-1 | Unified `ChannelAdapter` interface: `onMessage`, `sendMessage`, `sendTyping`, `sendMedia` | P0 | All adapters implement this |
| GW-2 | WhatsApp adapter (via Baileys or official Cloud API) | P2 | Deferred — unofficial API ban risk; revisit post-v1 |
| GW-3 | Telegram adapter (via Bot API / Telegraf) | P0 | |
| GW-4 | Discord adapter (via Discord.js) | P0 | |
| GW-5 | Slack adapter (via Bolt) | P1 | |
| GW-6 | Signal adapter (via signal-cli or linked device API) | P2 | Complexity varies by platform |
| GW-7 | iMessage adapter (macOS only, via AppleScript/Shortcuts bridge) | P2 | macOS-only constraint |
| GW-8 | Presence/typing indicators sent during agent processing | P0 | User sees "typing..." while agent thinks |
| GW-9 | Message queuing — inbound messages buffered during long-running tasks | P0 | FIFO queue, processed after current task |
| GW-10 | Graceful message injection — new messages can interrupt/augment an in-flight task | P1 | Model receives "user sent new message" mid-loop |
| GW-11 | Media support — images, files, voice notes receivable and sendable per channel | P1 | Adapter normalizes to common format |
| GW-12 | Future-proof adapter registration — new adapters loadable from `skills/` folder | P1 | No core code changes to add Mattermost, SMS, email, web chat |
| GW-13 | Channel-specific formatting (Markdown for Discord/Slack, plain text for SMS) | P1 | Adapter handles output formatting |

#### 5.2.3 Acceptance Criteria

- User sends a message on Telegram; agent replies within 5 seconds (excluding model latency).
- User sends a message on Telegram while agent is mid-task on Discord; message is queued and processed next.
- Adding a new channel adapter requires only implementing the `ChannelAdapter` interface and registering it.

---

### 5.3 Persistent, Editable Memory & Persona

#### 5.3.1 Description

The agent's personality, user preferences, instructions, and learned context live in human-readable Markdown files within the workspace. A SQLite database handles structured data (sessions, traces, embeddings cache). Long conversation histories are auto-compacted to avoid token blowup.

#### 5.3.2 Memory Files

| File | Purpose | Editable By |
|------|---------|-------------|
| `SOUL.md` | Personality, tone, behavioral boundaries, communication style | User |
| `USER.md` | User preferences, timezone, language, common contacts, routines | User + Agent (append-only) |
| `AGENTS.md` | Agent-level instructions, multi-agent routing rules (future) | User |
| `TOOLS.md` | Tool descriptions, usage notes, permission overrides | User |
| `MEMORY.md` | Auto-updated summaries of past interactions, learned facts | Agent (auto-compacted) |
| `HEARTBEAT.md` | Scheduled checklist items for proactive behavior | User + Agent |

#### 5.3.3 Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| MM-1 | Load all `.md` memory files into context at session start | P0 | Token-budgeted; truncate if exceeding limit |
| MM-2 | Agent can read/write memory files via dedicated `memory_*` tools | P0 | Not raw file I/O — semantic operations |
| MM-3 | SQLite database for sessions, traces, structured data, embeddings cache | P0 | Single `agent.db` file |
| MM-4 | Auto-compaction — summarize conversation history when exceeding token threshold | P0 | Configurable threshold (default: 80% of context window) |
| MM-5 | Memory file hot-reload — changes to `.md` files picked up without restart | P1 | File watcher or check-on-next-message |
| MM-6 | `MEMORY.md` append-only with dated entries; periodic summarization | P0 | Agent never deletes user-written entries |
| MM-7 | Embedding-based retrieval for long-term memory (when `MEMORY.md` exceeds context) | P2 | SQLite vector extension or external store |

#### 5.3.4 Acceptance Criteria

- User edits `SOUL.md` to change personality from formal to casual; next message reflects new tone.
- After 100+ messages, `MEMORY.md` is auto-compacted; agent still recalls key facts from early conversation.
- Session data (timestamps, token usage, tool calls) queryable in SQLite.

---

### 5.4 Tool System

#### 5.4.1 Description

An extensible, safe tool system starting with 8–12 general-purpose primitives. Tools use OpenAI/Anthropic-compatible function-calling schemas. New tools can be dynamically loaded from a `skills/` folder.

#### 5.4.2 Built-in Tool Primitives

| # | Tool | Description | Sandbox Level |
|---|------|-------------|---------------|
| 1 | `file_read` | Read file contents from workspace | Read-only |
| 2 | `file_write` | Write/create files in workspace | Write |
| 3 | `file_edit` | Patch/edit existing files (diff-based) | Write |
| 4 | `shell_exec` | Execute shell commands | Exec (sandboxed) |
| 5 | `browser_navigate` | Navigate headless Chromium to URL, return screenshot/DOM | Read-only |
| 6 | `browser_interact` | Click, type, scroll in headless browser | Write |
| 7 | `web_search` | Search the web via API abstraction (Google, Bing, Brave) | Read-only |
| 8 | `web_fetch` | Fetch and parse a URL (HTML → Markdown) | Read-only |
| 9 | `calendar_read` | Read calendar events (Google/Outlook via OAuth) | Read-only |
| 10 | `calendar_write` | Create/update calendar events | Write |
| 11 | `email_read` | Read inbox (Google/Outlook via OAuth) | Read-only |
| 12 | `email_send` | Send email (with confirmation gate) | Write |
| 13 | `code_interpret` | Execute Python in sandboxed REPL | Exec (sandboxed) |
| 14 | `image_analyze` | Analyze image via multimodal model | Read-only |
| 15 | `memory_read` | Read from memory files semantically | Read-only |
| 16 | `memory_write` | Append to memory files | Write |
| 17 | `finish` | Signal task completion with summary | N/A |

#### 5.4.3 Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| TS-1 | Function-calling schema compatible with OpenAI and Anthropic tool_use formats | P0 | Single schema, dual export |
| TS-2 | Rich tool descriptions with examples for model context | P0 | Stored in tool's schema file |
| TS-3 | Dynamic loading from `skills/` folder (convention: `skills/<name>/schema.json` + `handler.{ts,py}`) | P0 | Hot-reload on file change |
| TS-4 | Tool execution timeout (default 30s, configurable per tool) | P0 | Prevent hangs |
| TS-5 | Tool output truncation (max 10k chars, configurable) | P0 | Prevent context blowup |
| TS-6 | Permission annotations per tool (`read`, `write`, `exec`) | P0 | Enforced by governance layer |
| TS-7 | Tool error handling — structured error returned to model for recovery | P0 | Model can retry or try alternative |
| TS-8 | Parallel tool execution support | P1 | When model requests multiple independent tools |
| TS-9 | Tool progress streaming (long-running tools emit partial updates) | P1 | e.g., browser screenshot during navigation |
| TS-10 | `git clone` skill installer — `baseagent skill install <repo-url>` | P2 | Install community skills from git repos |

#### 5.4.4 Acceptance Criteria

- Agent uses `web_search` → `web_fetch` → `file_write` in sequence to research a topic and save notes.
- Dropping a new folder into `skills/` with schema + handler makes the tool available on next message.
- Shell commands run in sandbox; attempts to access files outside workspace are blocked.

---

### 5.5 Proactivity & Triggers

#### 5.5.1 Description

The agent doesn't just respond — it proactively checks in. A heartbeat scheduler wakes the agent periodically to read `HEARTBEAT.md` and decide whether to act. Webhooks and background pollers enable event-driven behavior.

#### 5.5.2 Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| PT-1 | Heartbeat scheduler — configurable interval (default: 30 min) | P0 | Reads `HEARTBEAT.md`, runs agent loop if action needed |
| PT-2 | `HEARTBEAT.md` format: checklist with schedule expressions (cron-like) | P0 | e.g., `- [ ] Every morning: check email and summarize` |
| PT-3 | Heartbeat result: agent either acts or logs "all good" | P0 | No unnecessary noise |
| PT-4 | Webhook HTTP endpoint for external event triggers | P1 | POST to `/webhook/{event}` → triggers agent loop with event context |
| PT-5 | Background pollers — configurable polling tasks (e.g., inbox check every 5 min) | P2 | Registered in config; run as separate async tasks |
| PT-6 | Proactive message routing — heartbeat/webhook results sent to configured channel | P0 | User picks which channel gets proactive messages |

#### 5.5.3 Acceptance Criteria

- Agent wakes at 8am, reads `HEARTBEAT.md` ("check email, summarize"), fetches inbox, sends summary to WhatsApp.
- External service POSTs to webhook; agent processes event and notifies user on Telegram.
- If heartbeat finds nothing actionable, it logs "all good" — no user-facing message.

---

## 6. v1.1–v1.2 — High-Priority Improvements

> **Scope:** Elevate from "works" to "delightful and production-grade."

---

### 6.1 Multi-Agent Primitives

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| MA-1 | Spawn sub-agents with isolated workspace and memory | P1 | Child sessions inherit parent's `SOUL.md` but get own `MEMORY.md` |
| MA-2 | Inter-agent messaging (parent ↔ child delegation) | P1 | Shared message bus or file-based |
| MA-3 | Shared canvas/files between agents | P2 | Designated shared directory |
| MA-4 | Routing via @mentions or prefixes in messages | P1 | e.g., `@research find papers on X` |
| MA-5 | Agent lifecycle management (start, stop, health check) | P1 | |

### 6.2 Observability & Debugging

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| OB-1 | Full trace logging to SQLite: every LLM call, tool I/O, reasoning step | P0 | Ships in v1, enhanced in v1.1 |
| OB-2 | Markdown trace export (`traces/YYYY-MM-DD-{task-id}.md`) | P1 | Human-readable session replay |
| OB-3 | Visual replay — web UI to step through sessions | P1 | Simple React app, read-only |
| OB-4 | Cost tracking per session (tokens in/out, model, estimated $) | P0 | |
| OB-5 | Eval harness — run sample tasks, score success rate/cost/steps | P2 | CI-friendly test suite |
| OB-6 | Health endpoint (`/health`) reporting loop status, queue depth, uptime | P1 | |

### 6.3 Enhanced Guardrails & Governance

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| GV-1 | Tiered permissions: `read-only`, `write`, `exec` per tool | P0 | Ships in v1 |
| GV-2 | User confirmation gates for `write` and `exec` tools | P0 | Configurable: always-ask, auto-allow, deny |
| GV-3 | Sandbox levels: `strict` (Docker), `medium` (restricted env), `loose` (same process) | P1 | Configurable per tool |
| GV-4 | Audit trail — all tool executions logged with input/output/user-approval | P0 | |
| GV-5 | Human-in-the-loop gates for high-risk actions (money, deletes, external sends) | P0 | |
| GV-6 | Prompt injection defense — XML tagging, tool input sanitization, output filtering | P1 | |
| GV-7 | Rate limiting per channel and per tool | P1 | Prevent runaway loops |

### 6.4 UI / Dashboard Layer

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| UI-1 | Minimal web admin: view sessions, traces, memory files, config | P1 | React + Tailwind |
| UI-2 | Live session view — watch agent reasoning in real time | P2 | WebSocket stream |
| UI-3 | Memory file editor (in-browser Markdown editor) | P2 | |
| UI-4 | Heartbeat status dashboard | P1 | |
| UI-5 | Mobile-responsive layout | P1 | Tailwind responsive breakpoints |

### 6.5 Model Abstraction & Local Support

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| ML-1 | Vercel AI SDK v6 provider abstraction (Anthropic, OpenAI, OpenRouter, Ollama) | P0 | Resolved — ADR-005; scaffolded in `@baseagent/core` |
| ML-2 | Fallback chain — try fast/cheap model first, escalate to stronger model on failure | P1 | Configurable chain |
| ML-3 | Structured output enforcement (JSON mode for tool calls and plans) | P0 | |
| ML-4 | Token counting and context window management per provider | P0 | |
| ML-5 | Local model support via Ollama/LM Studio | P1 | For privacy-sensitive or offline use |

---

## 7. v2+ — Nice-to-Haves & Extensions

These are out of scope for the initial releases but inform architectural decisions.

| Feature | Description |
|---------|-------------|
| **Skill Marketplace** | Agent can browse, evaluate, and install skills autonomously from a registry |
| **Voice I/O** | Whisper STT + TTS integration for voice-first interaction |
| **Offline-First Fallbacks** | Cache web results, queue actions when offline, sync when reconnected |
| **Export/Import Agent State** | Full state snapshot for migration, backup, or cloning |
| **Multi-User / Team Mode** | Isolated workspaces per user, shared knowledge base, role-based access |
| **Canvas / Visual Workspace** | Drag-drop images/notes, agent-drawn diagrams |
| **Plugin Sandboxing** | WASM-based skill isolation for untrusted community plugins |

---

## 8. Technical Constraints & Decisions

### 8.1 Decisions to Make (tracked in `docs/DECISIONS.md`)

| Decision | Options | Recommendation | Status |
|----------|---------|----------------|--------|
| Primary language | TypeScript, Python, Rust | **TypeScript** on Node.js 22+ | **Accepted** (ADR-004) |
| Package manager | pnpm, uv, cargo | **pnpm workspaces** | **Accepted** (ADR-004) |
| Database | SQLite (via better-sqlite3/Drizzle) | **SQLite** — zero-dep, single-file | **Accepted** (ADR-003) |
| LLM abstraction | Vercel AI SDK, LiteLLM, raw SDKs | **Vercel AI SDK v6** with provider adapters | **Accepted** (ADR-005) |
| HTTP framework | Hono, Express, Fastify | **Hono** — ultralight, Web Standard APIs | **Accepted** (ADR-006) |
| Validation | Zod, Joi, Yup | **Zod** — schema-first, type inference | **Accepted** (ADR-007) |
| Process model | Single process + async, multi-process workers | Single process + async (simpler v1) | Proposed |
| Container runtime | Docker, Podman, none | Docker for sandbox; optional for deployment | Proposed |
| LLM default | Claude (Anthropic), GPT (OpenAI) | Claude latest (Opus 4.6 / Sonnet 4.6) via OpenRouter for dev | Proposed |
| WhatsApp approach | Baileys (unofficial), Cloud API (official) | **Deferred** — ban risk; revisit post-v1 | Deferred |

### 8.2 Hard Constraints

- **Single-user, self-hosted** for v1.
- **SQLite** for all persistence (no external database dependency).
- **Monorepo** structure.
- **Latest stable** versions of all dependencies.
- **Tailwind CSS** for any web UI components.

---

## 9. Success Metrics

### 9.1 v1.0 Launch Criteria

| Metric | Target |
|--------|--------|
| Agent loop completes multi-step tasks | 95% success rate on 20 sample tasks |
| Message delivery latency (gateway → reply) | < 5s (excluding model inference) |
| Resumability | Process kill + restart recovers 100% of in-flight tasks |
| Memory persistence | Facts from 100+ messages ago retrievable after compaction |
| Tool extensibility | New tool loadable in < 5 min, no core code changes |
| Uptime (daemon) | 99%+ over 7-day soak test |

### 9.2 v1.1 Quality Gates

| Metric | Target |
|--------|--------|
| Full trace coverage | 100% of LLM calls and tool executions logged |
| Cost visibility | Per-session cost accurate within 5% |
| Sandbox escape | 0 successful escapes in security audit |
| Multi-agent task delegation | Child agent completes delegated task 90%+ of the time |

---

## 10. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| WhatsApp bans unofficial API usage | Loses primary channel | Medium | Support official Cloud API as fallback; prioritize Telegram |
| Token cost runaway on long tasks | Unexpected bills | High | Cost caps (AL-5), iteration limits (AL-3), auto-compaction (MM-4) |
| Prompt injection via user-forwarded messages | Agent takes unauthorized action | Medium | Input sanitization (GV-6), confirmation gates (GV-5), tiered permissions (GV-1) |
| Model API outages | Agent goes offline | Medium | Fallback chain (ML-2), local model support (ML-5), graceful degradation |
| Complexity creep in v1 | Delayed launch | High | Strict scope: loop + gateway + tools + memory. Everything else is v1.1+ |
| SQLite concurrency limits | Bottleneck under load | Low (single-user) | WAL mode; upgrade path to PostgreSQL if needed |
| Sandbox escape via shell tool | Security breach | Medium | Docker-based strict sandbox, restricted env vars, workspace-only file access |

---

## 11. Milestones & Phasing

### Phase 1 — Foundation (v1.0)

```
Week 1–2:  Project scaffolding, monorepo setup, CI/CD
           Agent loop (AL-1 through AL-6)
           SQLite schema, memory file loading (MM-1 through MM-3)

Week 3–4:  Tool system core (TS-1 through TS-7)
           Built-in tools: file_read/write/edit, shell_exec, web_search, web_fetch
           Loop resumability (AL-7, AL-8)

Week 5–6:  Gateway core + first 2 adapters (Telegram, Discord)
           Streaming integration (loop → gateway)
           Typing indicators, message queuing (GW-8, GW-9)

Week 7–8:  Remaining tools: browser, calendar, email, code_interpret
           Auto-compaction (MM-4)

Week 9–10: Heartbeat scheduler (PT-1 through PT-3, PT-6)
           Governance basics (GV-1, GV-2, GV-4, GV-5)
           Trace logging (OB-1, OB-4)

Week 11–12: Integration testing, soak testing
            Documentation, README, getting-started guide
            v1.0 release
```

### Phase 2 — Polish (v1.1)

```
Week 13–16: Fallback chain and model escalation (ML-2)
            Enhanced sandbox (GV-3)
            Webhook triggers (PT-4)
            Visual trace replay (OB-3)
            Slack adapter (GW-5)
            WhatsApp adapter exploration (GW-2)
```

### Phase 3 — Multi-Agent (v1.2)

```
Week 17–20: Sub-agent spawning (MA-1, MA-2)
            Agent routing (MA-4)
            Web admin dashboard (UI-1, UI-4, UI-5)
            Eval harness (OB-5)
            Signal/iMessage adapters (GW-6, GW-7)
```

---

## Appendix A: Memory File Formats

### SOUL.md (Example)

```markdown
# Soul

## Personality
You are a helpful, concise personal assistant. You prefer direct answers
over verbose explanations. You use casual but professional language.

## Boundaries
- Never share user data externally without explicit permission
- Always confirm before sending emails or messages on behalf of the user
- Refuse requests that involve illegal activity

## Communication Style
- Default language: English
- Humor: Dry, occasional
- Verbosity: Low — prefer bullet points over paragraphs
```

### HEARTBEAT.md (Example)

```markdown
# Heartbeat Checklist

- [ ] `0 8 * * *` Check email inbox, summarize unread
- [ ] `0 9 * * 1` Review calendar for the week, send overview
- [ ] `*/30 * * * *` Check if any monitored prices dropped below threshold
- [ ] `0 18 * * *` Daily summary of completed tasks
```

---

## Appendix B: Folder Structure

```
baseAgent/
├── .claude/                  # Claude Code skills & knowledge
│   ├── skills/               # AI workflow skills (/start-session, /remember, etc.)
│   └── knowledge/            # Persistent learnings across projects
├── .cursor/                  # Cursor AI commands & prompts
├── .vscode/                  # VS Code Copilot prompts
├── .github/                  # GitHub Copilot instructions
├── docs/
│   ├── PRD.md                # This document
│   ├── DECISIONS.md          # Architectural Decision Records
│   ├── COMMANDS.md           # All AI commands reference
│   ├── phases/               # Phase-based task planning
│   │   └── templates/        # Task planning templates
│   └── templates/            # PRD and document templates
├── packages/
│   ├── core/                 # Agent loop, state management
│   ├── gateway/              # Channel adapters, message routing
│   ├── memory/               # Memory loading, compaction, SQLite
│   ├── tools/                # Built-in tool implementations
│   ├── server/               # HTTP server, webhooks, health endpoint
│   └── dashboard/            # Web UI (v1.1+)
├── skills/                   # User-installed agent extensions
│   └── example-skill/
│       ├── schema.json
│       └── handler.ts
├── workspace/                # Agent's working directory
│   ├── SOUL.md
│   ├── USER.md
│   ├── AGENTS.md
│   ├── TOOLS.md
│   ├── MEMORY.md
│   └── HEARTBEAT.md
├── config/
│   └── default.yaml          # Runtime configuration
├── CURRENT_FOCUS.md          # Active work context
├── TOOLS_PREFERENCE.md       # Preferred libraries & tools
├── .env.example              # Required environment variables
├── agent.db                  # SQLite database (generated at runtime)
├── package.json
├── pnpm-workspace.yaml       # Workspace package paths
├── tsconfig.json             # Shared TypeScript base config
└── README.md
```

---

*End of PRD — baseAgent v1.0*
