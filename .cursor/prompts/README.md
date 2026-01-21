# Cursor Prompts

These prompts are the Cursor equivalent of Claude Code skills. They help maintain the vibe coding workflow.

## How to Use in Cursor

### Method 1: @ Reference (Recommended)
In Cursor's chat, you can reference these files directly:
```
@start-session.md
```
Then ask: "Follow this prompt to load my session context"

### Method 2: Copy-Paste
1. Open the relevant prompt file
2. Copy the instructions
3. Paste into Cursor chat as your prompt

### Method 3: Cmd+K with Context
1. Select code or open a file
2. Press `Cmd+K`
3. Reference the prompt: `@check-task.md mark task 2.3 complete`

## Available Prompts

| Prompt | Purpose | When to Use |
|--------|---------|-------------|
| `start-session.md` | Load project context | Start of each coding session |
| `log-decision.md` | Create an ADR | After making architectural decisions |
| `plan-phase.md` | Generate phase docs | Starting a new project phase |
| `update-focus.md` | Update Current Focus | End of session or after major progress |
| `check-task.md` | Mark tasks complete | After completing a task |
| `phase-status.md` | View phase progress | Checking overall progress |

## Quick Reference

```
# Start a session
"@start-session.md - load my project context"

# Log a decision
"@log-decision.md - log decision about using Redis for caching"

# Check a task
"@check-task.md - mark task 3.2 as complete"

# View status
"@phase-status.md - show phase 7 status"

# Update focus
"@update-focus.md - completed auth middleware and API routes"
```

## Differences from Claude Code

| Claude Code | Cursor |
|-------------|--------|
| `/start-session` | `@start-session.md` + instruction |
| Automatic skill invocation | Manual @ reference |
| Arguments via slash command | Arguments in natural language |
