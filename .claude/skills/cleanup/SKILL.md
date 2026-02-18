---
name: cleanup
description: Reset project to baseAgent template state while preserving core infrastructure
disable-model-invocation: true
argument-hint: "[--dry-run] [--keep-decisions]"
---

# Cleanup - Reset to Template State

Reset the project to a clean baseAgent template state, removing project-specific content while preserving the core agentic infrastructure for reuse.

## Instructions

This skill removes domain-specific and project-specific files while keeping the baseAgent template infrastructure intact.

### What Gets REMOVED (Project-Specific)

These files contain project-specific content and will be deleted or reset:

```
Files to DELETE:
├── docs/TECH_STACK.md               # Technology choices
├── docs/ARCHITECTURE_GUIDE.md       # Architecture decisions
├── docs/DESIGN_SYSTEM.md            # Design tokens
├── docs/PRODUCTION_ROADMAP.md       # Project roadmap
├── docs/phases/phase*/PHASE*_TASKS.md  # Task breakdowns
├── workspace/SOUL.md                # Agent persona
├── workspace/USER.md                # User preferences
├── workspace/MEMORY.md              # Interaction history
├── workspace/HEARTBEAT.md           # Proactive tasks
├── workspace/AGENTS.md              # Agent instructions
├── workspace/TOOLS.md               # Tool overrides
├── skills/*/                        # Domain-specific skills
├── config/default.yaml              # Runtime config
│
Files to RESET (restore to template state):
├── CURRENT_FOCUS.md                 # Reset to placeholder
├── TOOLS_PREFERENCE.md              # Reset to defaults
└── docs/DECISIONS.md                # Reset to template with base ADRs
```

### What Gets PRESERVED (Template Infrastructure)

These files are kept intact for rebuilding:

```
ALWAYS PRESERVED:
├── README.md                        # Project README
├── .cursorrules                     # Cursor AI rules
│
├── docs/
│   ├── PRD.md                       # Product requirements
│   ├── COMMANDS.md                  # Commands guide
│   ├── phases/
│   │   ├── README.md                # Phase overview (preserved)
│   │   ├── phase*/README.md         # Phase READMEs (preserved)
│   │   └── templates/               # All templates preserved
│   └── templates/
│       └── PRD_TEMPLATE.md          # PRD template preserved
│
├── packages/                        # Core agent packages (preserved)
│   ├── core/
│   ├── gateway/
│   ├── memory/
│   ├── tools/
│   └── dashboard/
│
├── .claude/skills/                  # All workflow skills preserved
├── .claude/knowledge/               # Knowledge base preserved
├── .cursor/commands/                # All commands preserved
├── .cursor/prompts/                 # All prompts preserved
├── .vscode/prompts/                 # All prompts preserved
└── .github/copilot-instructions.md  # Copilot context preserved
```

## Process

### Step 1: Dry Run (Default)

First, show what would be deleted without making changes:

```markdown
## Cleanup Preview

### Files to DELETE:
- workspace/SOUL.md
- workspace/HEARTBEAT.md
- skills/my-domain-skill/
- config/default.yaml
- ...

### Files to RESET:
- CURRENT_FOCUS.md → restore to template
- docs/DECISIONS.md → keep base ADRs only

### Files PRESERVED:
- packages/core/ ✓
- packages/gateway/ ✓
- docs/PRD.md ✓
- docs/templates/PRD_TEMPLATE.md ✓
- .claude/skills/ ✓
- ...

Proceed with cleanup? [y/N]
```

### Step 2: Execute Cleanup

After confirmation:

1. **Delete project-specific files** (workspace/, skills/, config/)
2. **Reset CURRENT_FOCUS.md** to template state:
   ```markdown
   # Current Focus

   ## Active Work

   **Phase**: Not started
   **Task**: None
   **Status**: Ready to begin

   ## Quick Context

   **What we're doing**: Project not yet initialized
   **Why**: -
   **Blocked by**: Nothing
   **Next up**: Run `/kickstart` to initialize a new agentic application

   ## Key Files

   - PRD: `docs/PRD.md`
   - Commands: `docs/COMMANDS.md`

   ## Session Notes

   _No active session_

   ## Last Updated

   **Date**: [Today's date]
   **Status**: Not Started
   ```

3. **Reset docs/DECISIONS.md** - Keep structure and base template ADRs, remove project-specific ADRs

### Step 3: Summary

```markdown
## Cleanup Complete

### Deleted: X files
- [list of deleted files]

### Reset: 2 files
- CURRENT_FOCUS.md
- docs/DECISIONS.md

### Preserved: Y files
- All packages
- All templates
- All skills/commands
- Knowledge base

Ready to start fresh with `/kickstart`
```

## Options

- `--dry-run` - Preview changes without executing (default behavior)
- `--keep-decisions` - Preserve all ADRs in DECISIONS.md
- `--keep-phases` - Preserve phase task files (PHASE*_TASKS.md)
- `--keep-workspace` - Preserve workspace memory files (SOUL.md, etc.)

## Safety Features

1. **Always dry-run first** - Show preview before any deletion
2. **Require confirmation** - Ask before executing
3. **Preserve packages** - Core agent code is never touched
4. **Preserve templates** - All templates are never touched
5. **Git-aware** - Remind user to commit before cleanup if there are changes

## Arguments: $ARGUMENTS
