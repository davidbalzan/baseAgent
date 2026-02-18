---
name: kickstart
description: Initialize a new agentic application project from the baseAgent template
disable-model-invocation: true
argument-hint: "<project name>"
---

# Kickstart - Agentic Application Initializer

Initialize a new agentic application using baseAgent as the foundation. This skill guides you through forking the template, configuring the agent's identity, selecting channels, and setting up the project documentation.

## Context

**baseAgent** is a template for building agentic applications. When a user runs `/kickstart`, they want to create a **new project** based on this template — not modify baseAgent itself. The new project inherits baseAgent's architecture (ReAct loop, gateway, tools, memory) and adds domain-specific configuration.

## Instructions

Follow this guided flow to initialize a new agentic application.

### Stage 1: Project Identity

Gather basic information:

1. **Project name** - What's the agent/app called?
2. **Agent purpose** - One sentence: what does this agent do? (e.g., "Personal finance assistant", "DevOps monitoring bot")
3. **Target users** - Who will interact with this agent?

Create or update the project folder structure:

```
<project-name>/
├── docs/
│   ├── phases/
│   │   └── templates/        # Inherited from baseAgent
│   └── templates/            # Inherited from baseAgent
├── packages/
│   ├── core/                 # Agent loop (inherited)
│   ├── gateway/              # Channel adapters (inherited)
│   ├── memory/               # Memory system (inherited)
│   ├── tools/                # Built-in tools (inherited)
│   └── dashboard/            # Web UI (optional)
├── skills/                   # Domain-specific agent skills
├── workspace/                # Agent memory files
│   ├── SOUL.md               # Agent personality & boundaries
│   ├── USER.md               # User preferences
│   └── HEARTBEAT.md          # Proactive task schedule
├── config/
│   └── default.yaml          # Runtime configuration
└── CURRENT_FOCUS.md
```

### Stage 2: Agent Persona (SOUL.md)

Ask about the agent's personality:

1. **Tone** - Formal, casual, friendly, professional, minimal?
2. **Communication style** - Verbose or concise? Bullet points or paragraphs?
3. **Language** - Default language for responses?
4. **Boundaries** - What should the agent refuse to do?
5. **Special behaviors** - Any quirks or personality traits?

Generate `workspace/SOUL.md` with the persona definition.

### Stage 3: Channel Configuration

Ask which messaging channels to enable:

- **Telegram** - Bot API token needed
- **Discord** - Bot token + guild ID needed
- **WhatsApp** - Baileys or Cloud API setup
- **Slack** - Bolt app credentials needed
- **Other** - Custom adapter planned?

For each selected channel, note required credentials (don't collect them — just document what's needed).

Generate initial `config/default.yaml` with channel configuration placeholders.

### Stage 4: Domain Skills & Tools

Ask about the agent's specialization:

1. **What tasks should it handle?** - List 3-5 core capabilities
2. **External integrations?** - APIs, services, databases it needs to connect to
3. **Proactive behaviors?** - What should it check on its own schedule?

Generate:
- `workspace/HEARTBEAT.md` - Proactive task schedule based on answers
- Skeleton skill folders in `skills/` for each domain capability
- Update `TOOLS_PREFERENCE.md` with any new tool dependencies

### Stage 5: Tech Stack Decisions

Confirm or customize the inherited defaults:

| Decision | Default | Ask User |
|----------|---------|----------|
| Language | TypeScript | Confirm or change |
| Database | SQLite | Confirm or change |
| LLM Provider | Claude (Anthropic) | Confirm or add fallbacks |
| Package Manager | pnpm | Confirm or change |
| Sandbox | Docker | Confirm or change |

Generate:
- `docs/TECH_STACK.md` - Technology choices and versions
- `docs/DECISIONS.md` - ADRs for any deviations from baseAgent defaults

### Stage 6: Project Phases

Based on the agent's scope, suggest a phase structure:

**Typical Agentic App Phases:**
```
Phase 1: Foundation (Loop setup, SQLite, basic tools, first channel adapter)
Phase 2: Core Skills (Domain-specific tools, memory integration)
Phase 3: Multi-Channel (Additional adapters, message routing)
Phase 4: Proactivity (Heartbeat, webhooks, background pollers)
Phase 5: Polish (Dashboard, observability, governance)
```

Generate:
- `docs/PRODUCTION_ROADMAP.md` - High-level roadmap
- `docs/phases/README.md` - Phase overview
- `docs/phases/phase1/README.md` - First phase outline
- `CURRENT_FOCUS.md` - Set to Phase 1

### Stage 7: Summary & Next Steps

Provide a summary of everything created:

```markdown
## Project Initialized: [Project Name]

### Agent Identity
- **Purpose**: [one-liner]
- **Channels**: [list]
- **Core Skills**: [list]

### Files Created/Updated
- workspace/SOUL.md
- workspace/HEARTBEAT.md
- config/default.yaml
- docs/TECH_STACK.md
- docs/PRODUCTION_ROADMAP.md
- docs/DECISIONS.md
- docs/phases/README.md
- docs/phases/phase1/README.md
- CURRENT_FOCUS.md
- skills/<domain>/schema.json (skeleton)

### Next Steps
1. Run `/create-prd` to define detailed requirements
2. Run `/plan-phase 1 Foundation` to create detailed tasks
3. Add API credentials to `config/default.yaml`
4. Run `/start-session` to begin development
```

## Conversation Flow

```
1. Greet and explain: "Let's set up a new agentic app from baseAgent"
2. Stage 1: Project identity → folder structure
3. Stage 2: Agent persona → SOUL.md
4. Stage 3: Channel selection → config/default.yaml
5. Stage 4: Domain skills → HEARTBEAT.md, skill skeletons
6. Stage 5: Tech stack confirmation → TECH_STACK.md, DECISIONS.md
7. Stage 6: Define phases → PRODUCTION_ROADMAP.md, phases/
8. Stage 7: Summary and next steps
```

## Tips

- **Start with one channel** — get Telegram or Discord working before adding more
- **Keep SOUL.md short** — the agent reads it every session, token-budget it
- **Heartbeat is optional** — skip if the agent only needs to be reactive
- **Don't over-skill** — start with 2-3 domain skills, add more as needed

## Related Skills

After kickstart, use these in order:
1. `/create-prd` - Define detailed product requirements
2. `/plan-phase 1 Foundation` - Create Phase 1 task breakdown
3. `/start-session` - Begin your first coding session
4. `/log-decision` - Record decisions as you make them

## Project to initialize: $ARGUMENTS
