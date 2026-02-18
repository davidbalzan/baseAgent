# baseAgent - Copilot Instructions

This project is **baseAgent** — an agentic application template with a streaming ReAct loop, multi-channel messaging gateway, extensible tools, and Markdown-based memory.

## Project Structure

```
baseAgent/
├── docs/
│   ├── PRD.md                ← Full product requirements
│   ├── DECISIONS.md          ← Architectural Decision Records
│   └── phases/               ← Phase-based task planning
├── packages/
│   ├── core/                 ← Agent loop, state management
│   ├── gateway/              ← Channel adapters (WhatsApp, Telegram, Discord, Slack)
│   ├── memory/               ← Memory loading, compaction, SQLite
│   ├── tools/                ← Built-in tool implementations
│   └── dashboard/            ← Web admin UI (v1.1+)
├── skills/                   ← User-installed extensions
├── workspace/                ← Agent's working directory (SOUL.md, USER.md, etc.)
├── config/                   ← Runtime configuration
└── CURRENT_FOCUS.md          ← Quick session context
```

## Key Documents to Read First

1. **CURRENT_FOCUS.md** - What's actively being worked on
2. **docs/PRD.md** - Full product requirements and phasing
3. **docs/DECISIONS.md** - Architectural decisions and rationale
4. **docs/phases/phaseN/PHASEN_TASKS.md** - Detailed task breakdowns

## Status Indicators

- Complete
- In Progress
- Not Started
- Critical Priority
- Medium Priority
- Low Priority

## Task Checkbox Format

```markdown
- [ ] Uncompleted task
- [x] Completed task
```

## When Working on Tasks

1. Check CURRENT_FOCUS.md for active work
2. Find the task in the relevant phase TASKS file
3. Update checkboxes as you complete sub-tasks
4. Update progress metrics when tasks complete

## Coding Preferences

- Clean architectures, modular approach structured for AI context efficiency
- Tailwind CSS for styling (dashboard UI)
- Latest stable versions of dependencies
- Streaming-first design — every layer supports partial output
- Adapter pattern for I/O (channels, LLM providers, tools)
- Avoid unnecessary code duplication
- Maintain consistency across the codebase
