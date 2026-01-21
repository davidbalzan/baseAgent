# AI Assistant Commands Guide

This guide explains how to use the vibe coding workflow commands across different IDEs.

---

## Quick Reference

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `kickstart` | Initialize project structure | Starting a brand new project |
| `create-prd` | Generate product requirements | Before development begins |
| `start-session` | Load project context | Start of each coding session |
| `plan-phase` | Create phase task breakdown | Starting a new development phase |
| `log-decision` | Record architectural decision | After making tech choices |
| `update-focus` | Update current work status | End of session or after progress |
| `check-task` | Mark tasks complete | After completing a task |
| `phase-status` | View phase progress | Checking overall progress |

---

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PROJECT LIFECYCLE                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐ │
│  │kickstart │ ──▶│ create-prd │ ──▶│ plan-phase │ ──▶│start-session│ │
│  └──────────┘    └────────────┘    └────────────┘    └────────────┘ │
│       │                                                     │        │
│       ▼                                                     ▼        │
│  Sets up docs/          Creates PRD         Creates tasks   │        │
│  structure              with requirements   for Phase 1     │        │
│                                                             │        │
│                         DEVELOPMENT LOOP                    │        │
│                    ┌────────────────────────┐               │        │
│                    │                        │               │        │
│                    ▼                        │               │        │
│              ┌──────────┐             ┌─────┴──────┐        │        │
│              │check-task│ ◀────────── │   Code!    │ ◀──────┘        │
│              └──────────┘             └────────────┘                 │
│                    │                        ▲                        │
│                    ▼                        │                        │
│              ┌────────────┐           ┌─────┴──────┐                 │
│              │update-focus│ ────────▶ │log-decision│                 │
│              └────────────┘           └────────────┘                 │
│                    │                                                 │
│                    ▼                                                 │
│              ┌────────────┐                                          │
│              │phase-status│                                          │
│              └────────────┘                                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## IDE-Specific Usage

### Claude Code (Terminal)

Use slash commands directly:

```bash
# Initialize a new project
/kickstart MyProject

# Create product requirements
/create-prd "E-commerce platform"

# Start a coding session
/start-session

# Plan a phase
/plan-phase 1 "Foundation"

# Log a decision
/log-decision "Use PostgreSQL for database"

# Update current focus
/update-focus "Completed auth middleware"

# Mark a task complete
/check-task 2.3

# Check phase status
/phase-status 1
```

### Cursor

Type `/` in Agent chat (Cmd+L) to see available commands:

```
/kickstart
/create-prd
/start-session
/plan-phase
/log-decision
/update-focus
/check-task
/phase-status
```

Alternative: Use `@` file references:
```
@kickstart.md - initialize my new project
@create-prd.md - create PRD for authentication system
```

### VS Code Copilot

1. Open Copilot Chat (Cmd+Shift+I)
2. Click the paperclip icon or type `/`
3. Select "Prompt..." from the menu
4. Choose the prompt you want

Available prompts:
- `kickstart.prompt.md`
- `create-prd.prompt.md`
- `start-session.prompt.md`
- `plan-phase.prompt.md`
- `log-decision.prompt.md`
- `update-focus.prompt.md`
- `check-task.prompt.md`
- `phase-status.prompt.md`

---

## Command Details

### `/kickstart`

**Purpose**: Initialize a new project with complete documentation structure.

**What it does**:
1. Creates folder structure (`docs/`, `client/`, `server/`)
2. Guides through tech stack selection → `TECH_STACK.md`
3. Records architecture decisions → `ARCHITECTURE_GUIDE.md`, `DECISIONS.md`
4. Sets up phase structure → `PRODUCTION_ROADMAP.md`, `phases/`
5. Initializes focus tracking → `CURRENT_FOCUS.md`
6. Optionally creates design system → `DESIGN_SYSTEM.md`

**When to use**: Starting a brand new project from scratch.

**Example**:
```
/kickstart "TaskFlow - A project management app"
```

---

### `/create-prd`

**Purpose**: Generate a comprehensive Product Requirements Document.

**What it does**:
1. Guides through problem discovery
2. Captures vision and measurable goals
3. Defines user personas and stories
4. Documents functional requirements with acceptance criteria
5. Captures non-functional requirements (performance, security)
6. Identifies risks and creates timeline

**When to use**: Before starting development, to define what you're building.

**Example**:
```
/create-prd "User authentication system with OAuth support"
```

**Output**: `docs/PRD.md` or `docs/PRD_[ProductName].md`

---

### `/start-session`

**Purpose**: Load project context at the beginning of a coding session.

**What it does**:
1. Reads `CURRENT_FOCUS.md` for active work
2. Reviews phase progress from roadmap
3. Checks recent decisions that affect current work
4. Summarizes blockers and next steps

**When to use**: Every time you start working on the project.

**Example**:
```
/start-session
```

**Output**: Session summary with current task, recent progress, and suggested next steps.

---

### `/plan-phase`

**Purpose**: Create detailed task breakdown for a development phase.

**What it does**:
1. Analyzes phase goals from roadmap
2. Explores codebase for relevant patterns
3. Assesses risks and dependencies
4. Creates 4-6 major tasks with sub-steps
5. Defines success criteria

**When to use**: Starting a new phase of development.

**Example**:
```
/plan-phase 2 "Authentication & Authorization"
```

**Output**:
- `docs/phases/phase2/README.md`
- `docs/phases/phase2/PHASE2_TASKS.md`

---

### `/log-decision`

**Purpose**: Create an Architectural Decision Record (ADR).

**What it does**:
1. Captures the decision context
2. Documents what was decided
3. Records consequences (positive, negative, risks)
4. Lists alternatives considered
5. Updates the ADR index

**When to use**: After making significant technical decisions.

**Example**:
```
/log-decision "Use Redis for session caching"
```

**Output**: New ADR entry in `docs/DECISIONS.md`

---

### `/update-focus`

**Purpose**: Update the current work status in `CURRENT_FOCUS.md`.

**What it does**:
1. Updates active phase/task/sub-step
2. Records what's being worked on and why
3. Notes any blockers
4. Updates session notes
5. Sets the "Last Updated" timestamp

**When to use**:
- End of coding session
- After completing a major task
- When encountering or resolving blockers

**Example**:
```
/update-focus "Completed JWT middleware, starting RBAC implementation"
```

---

### `/check-task`

**Purpose**: Mark tasks as complete and update progress.

**What it does**:
1. Updates checkbox in task file (`- [ ]` → `- [x]`)
2. Updates progress statistics
3. Adds completion notes if significant
4. Optionally updates related files

**When to use**: After completing a task or sub-task.

**Example**:
```
/check-task 2.3
```

---

### `/phase-status`

**Purpose**: Get a comprehensive status report on phase progress.

**What it does**:
1. Calculates progress percentages
2. Lists completed, in-progress, and remaining tasks
3. Identifies blockers and risks
4. Provides actionable summary

**When to use**: Checking overall progress, sprint planning, status updates.

**Example**:
```
/phase-status 2
```

---

## File Locations

| IDE | Location | File Pattern |
|-----|----------|--------------|
| Claude Code | `.claude/skills/[name]/` | `SKILL.md` |
| Cursor | `.cursor/commands/` | `[name].md` |
| VS Code | `.vscode/prompts/` | `[name].prompt.md` |

---

## Tips for Effective Use

### Start Every Session Right
```
/start-session
```
This loads context and reminds you where you left off.

### Capture Decisions Immediately
When you make a technology choice, log it:
```
/log-decision "Chose Zustand over Redux for state management"
```
Future you will thank you.

### Keep Focus Updated
At the end of each session:
```
/update-focus "Completed X, next up is Y"
```

### Use Phase Status for Planning
Before starting new work:
```
/phase-status 2
```
This helps identify what's left and what's blocked.

### Don't Skip the PRD
Even for small features:
```
/create-prd "Dark mode toggle"
```
It forces you to think through requirements before coding.

---

## Troubleshooting

### Commands not appearing in Cursor
- Ensure files are in `.cursor/commands/` (not `.cursor/prompts/`)
- Restart Cursor after adding new commands
- Check that files have `.md` extension

### Commands not appearing in VS Code
- Ensure files are in `.vscode/prompts/`
- Files must have `.prompt.md` extension
- Check the `mode` in frontmatter (`ask` or `edit`)

### Claude Code skills not working
- Skills must be in `.claude/skills/[name]/SKILL.md`
- Check the frontmatter format (name, description)
- Ensure `disable-model-invocation: true` is set

---

## Contributing

To add a new command:

1. Create the Claude Code skill in `.claude/skills/[name]/SKILL.md`
2. Create the Cursor command in `.cursor/commands/[name].md`
3. Create the VS Code prompt in `.vscode/prompts/[name].prompt.md`
4. Update this guide with the new command
5. Update the IDE-specific READMEs
