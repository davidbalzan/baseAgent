# VS Code Copilot Prompts

These prompts are the **VS Code Copilot equivalent** of Claude Code skills and Cursor prompts. They help maintain the vibe coding workflow.

## How to Use in VS Code Copilot

### Method 1: Prompt Picker (Recommended)
1. Open Copilot Chat (Ctrl+Shift+I / Cmd+Shift+I)
2. Click the **paperclip icon** or type `/`
3. Select **"Prompt..."** from the menu
4. Choose the prompt you want to use

### Method 2: Direct Reference
In Copilot Chat, you can reference files:
```
#file:.vscode/prompts/start-session.prompt.md
Follow this prompt to load my session context
```

### Method 3: Keyboard Shortcut
1. Set up keybindings for frequently used prompts
2. Use `Cmd+K Cmd+P` (or your custom binding) to open prompt picker

## Available Prompts

| Prompt | Mode | Purpose | When to Use |
|--------|------|---------|-------------|
| `kickstart.prompt.md` | edit | Initialize project structure | Starting a brand new project |
| `create-prd.prompt.md` | edit | Generate a PRD | Defining product requirements |
| `start-session.prompt.md` | ask | Load project context | Start of each coding session |
| `log-decision.prompt.md` | edit | Create an ADR | After making architectural decisions |
| `plan-phase.prompt.md` | edit | Generate phase docs | Starting a new project phase |
| `update-focus.prompt.md` | edit | Update CURRENT_FOCUS.md | End of session or after major progress |
| `check-task.prompt.md` | edit | Mark tasks complete | After completing a task |
| `phase-status.prompt.md` | ask | View phase progress | Checking overall progress |

## Prompt Modes

- **ask**: Read-only, provides information/analysis
- **edit**: Can modify files in the workspace

## Quick Reference

```
# Initialize a new project
Open prompt picker → kickstart → "initialize my new project called MyApp"

# Create a PRD
Open prompt picker → create-prd → "create PRD for user authentication system"

# Start a session
Open prompt picker → start-session → "load my project context"

# Log a decision
Open prompt picker → log-decision → "log decision about using Redis for caching"

# Check a task
Open prompt picker → check-task → "mark task 3.2 as complete"

# View status
Open prompt picker → phase-status → "show phase 2 status"

# Update focus
Open prompt picker → update-focus → "completed auth middleware and API routes"
```

## Comparison: Claude Code vs Cursor vs VS Code Copilot

| Claude Code | Cursor | VS Code Copilot |
|-------------|--------|-----------------|
| `/start-session` | `@start-session.md` | Prompt picker → `start-session` |
| Slash commands | @ file reference | Prompt files + picker |
| `$ARGUMENTS` variable | Natural language | Natural language in chat |
| `.claude/skills/` | `.cursor/prompts/` | `.vscode/prompts/` |
| `SKILL.md` files | `.md` files | `.prompt.md` files |

## Global Instructions

The `.github/copilot-instructions.md` file provides global context to Copilot for all conversations in this workspace. It includes:

- Project structure overview
- Key documents to reference
- Status indicators
- Coding preferences

## Setting Up

1. Ensure you have the GitHub Copilot extension installed
2. The `.vscode/prompts/` directory is automatically detected
3. Prompts appear in the prompt picker when you open Copilot Chat

## Tips

- Use `#file:` to reference specific files in your prompts
- Use `#selection` to include selected code
- Combine prompts with file references for best results
- The `mode` in frontmatter determines if the prompt can edit files
