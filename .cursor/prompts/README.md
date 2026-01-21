# Cursor Prompts & Commands

These prompts and commands help maintain the vibe coding workflow in Cursor.

## Slash Commands (Recommended)

Cursor supports custom slash commands via `.cursor/commands/`. Type `/` in Agent chat to see available commands.

### Available Commands

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/kickstart` | Initialize project structure | Starting a brand new project |
| `/create-prd` | Generate a PRD | Defining product requirements |
| `/start-session` | Load project context | Start of each coding session |
| `/log-decision` | Create an ADR | After making architectural decisions |
| `/plan-phase` | Generate phase docs | Starting a new project phase |
| `/update-focus` | Update CURRENT_FOCUS.md | End of session or after major progress |
| `/check-task` | Mark tasks complete | After completing a task |
| `/phase-status` | View phase progress | Checking overall progress |
| `/cleanup` | Reset to template state | Reusing template for new project |

### How to Use

1. Open Cursor's Agent chat (Cmd+L or Ctrl+L)
2. Type `/` to see available commands
3. Select the command from the dropdown
4. The command content becomes your prompt with full project context

### Quick Reference

```
/kickstart          # Initialize new project
/create-prd         # Create product requirements doc
/start-session      # Load session context
/plan-phase         # Plan a new phase
/log-decision       # Record an ADR
/update-focus       # Update current focus
/check-task         # Mark task complete
/phase-status       # View phase progress
/cleanup            # Reset to template state
```

---

## @ File References (Alternative)

You can also reference prompt files directly in chat using `@`:

### Available Prompts

| Prompt | Purpose |
|--------|---------|
| `@kickstart.md` | Initialize project structure |
| `@create-prd.md` | Generate a PRD |
| `@start-session.md` | Load project context |
| `@log-decision.md` | Create an ADR |
| `@plan-phase.md` | Generate phase docs |
| `@update-focus.md` | Update Current Focus |
| `@check-task.md` | Mark tasks complete |
| `@phase-status.md` | View phase progress |
| `@cleanup.md` | Reset to template state |

### How to Use

```
@start-session.md - load my project context
@create-prd.md - create PRD for user authentication
@log-decision.md - log decision about using Redis
```

---

## Directory Structure

```
.cursor/
├── commands/           # Slash commands (/command)
│   ├── kickstart.md
│   ├── create-prd.md
│   ├── start-session.md
│   ├── plan-phase.md
│   ├── log-decision.md
│   ├── update-focus.md
│   ├── check-task.md
│   ├── phase-status.md
│   └── cleanup.md
│
└── prompts/            # @ references (@file.md)
    ├── README.md
    ├── kickstart.md
    ├── create-prd.md
    └── ... (same files)
```

---

## Comparison: Claude Code vs Cursor vs VS Code Copilot

| Claude Code | Cursor | VS Code Copilot |
|-------------|--------|-----------------|
| `/kickstart` | `/kickstart` | Prompt picker → `kickstart` |
| Slash commands | Slash commands | Prompt files + picker |
| `.claude/skills/` | `.cursor/commands/` | `.vscode/prompts/` |
| `SKILL.md` files | `.md` files | `.prompt.md` files |
