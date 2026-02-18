# baseAgent

> An agentic application template — streaming ReAct loop, multi-channel messaging gateway, extensible tools, and Markdown-based memory. Built with the [vibeSeed](https://github.com/davidbalzan/vibeSeed) methodology.

---

## What Is This?

**baseAgent** is a general-purpose, always-on personal assistant template. It provides the foundational architecture for building agentic applications that connect to messaging platforms, run autonomous task loops, and persist context in human-readable files.

No domain-specific logic is included. Instead, baseAgent ships the **bones** — you add domain skills on top.

### Key Differentiators

- **Multi-channel gateway** — single daemon handles WhatsApp, Telegram, Discord, Slack, and more via adapter plugins
- **Streaming ReAct loop** — reason, act, observe with real-time partial output to the user
- **Resumable tasks** — long-running tasks survive crashes and restarts (state persisted to SQLite)
- **Editable Markdown memory** — personality (`SOUL.md`), user prefs (`USER.md`), learned facts (`MEMORY.md`) are human-readable files
- **Heartbeat proactivity** — agent wakes on a schedule and decides what to do
- **Extensible tool system** — drop a folder into `skills/` to add new capabilities

---

## Project Structure

```
baseAgent/
├── docs/
│   ├── PRD.md                  # Product Requirements Document
│   ├── DECISIONS.md            # Architectural Decision Records
│   ├── COMMANDS.md             # AI commands reference (all IDEs)
│   ├── phases/                 # Phase-based task planning
│   └── templates/              # PRD and task templates
├── packages/
│   ├── core/                   # Agent loop, state management
│   ├── gateway/                # Channel adapters, message routing
│   ├── memory/                 # Memory loading, compaction, SQLite
│   ├── tools/                  # Built-in tool implementations
│   └── dashboard/              # Web admin UI (v1.1+)
├── skills/                     # User-installed extensions
├── workspace/                  # Agent's working directory
│   ├── SOUL.md                 # Personality & boundaries
│   ├── USER.md                 # User preferences
│   ├── MEMORY.md               # Auto-updated interaction summaries
│   └── HEARTBEAT.md            # Scheduled proactive tasks
├── config/
│   └── default.yaml            # Runtime configuration
├── CURRENT_FOCUS.md            # Active work context
├── VIBE_CODING_SEED.md         # Development methodology reference
└── TOOLS_PREFERENCE.md         # Preferred libraries & tools
```

---

## Development Methodology

This project uses **Vibe Coding** — a documentation-driven approach for building software with AI assistance. See [VIBE_CODING_SEED.md](./VIBE_CODING_SEED.md) for the full methodology.

### Key Documents

| Document | Purpose |
|----------|---------|
| [docs/PRD.md](./docs/PRD.md) | Full product requirements and phasing |
| [docs/DECISIONS.md](./docs/DECISIONS.md) | Architectural Decision Records |
| [CURRENT_FOCUS.md](./CURRENT_FOCUS.md) | Active work context for AI handoffs |
| [docs/COMMANDS.md](./docs/COMMANDS.md) | All AI commands for Claude Code, Cursor, VS Code |

### Workflow

```
/start-session → [code] → /check-task → /update-focus → /log-decision
```

See [docs/COMMANDS.md](./docs/COMMANDS.md) for all available AI commands across IDEs.

---

## Tech Stack (Proposed)

> Final decisions tracked in [docs/DECISIONS.md](./docs/DECISIONS.md)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Runtime | Node.js 22+ / TypeScript | TBD — language decision open |
| Database | SQLite | Zero-dep, single-file persistence |
| Web Framework | Hono 4.x | Lightweight, TypeScript-first |
| LLM Provider | Claude (Anthropic) | Multi-provider abstraction planned |
| Package Manager | pnpm | Monorepo workspaces |
| Styling (Dashboard) | Tailwind CSS 4.x | For any web UI components |
| Sandbox | Docker | For shell/code execution tools |

---

## Roadmap

### v1.0 — Core Foundations
- Streaming ReAct agent loop with resumability
- Multi-channel gateway (Telegram, Discord, WhatsApp)
- 12+ built-in tool primitives
- Markdown memory system with auto-compaction
- Heartbeat scheduler for proactive behavior

### v1.1 — Polish
- Model provider abstraction (OpenAI, Anthropic, Ollama, etc.)
- Enhanced sandboxing
- Webhook triggers
- Trace replay UI

### v1.2 — Multi-Agent
- Sub-agent spawning and delegation
- Agent routing via @mentions
- Web admin dashboard

See [docs/PRD.md](./docs/PRD.md) for detailed requirements and milestones.

---

## Getting Started

> *Project scaffolding not yet implemented. This section will be updated as v1.0 development begins.*

```bash
# Clone the repo
git clone git@github.com:davidbalzan/baseAgent.git
cd baseAgent

# Start a coding session
/start-session
```

---

## Knowledge & Skills

This project inherits the vibeSeed knowledge capture system:

```
~/.claude/
├── skills/           # AI workflow skills (/start-session, /remember, /distill, etc.)
└── knowledge/        # Persistent learnings across all projects
```

Use `/remember` to capture patterns as you build. Use `/distill` sparingly to formalize decisions into ADRs.

---

**License**: Proprietary. All rights reserved.
