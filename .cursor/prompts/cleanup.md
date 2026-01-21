# Cleanup - Reset to Template State

**Objective**: Reset the project to a clean template state, removing project-specific content while preserving essential structure for reuse.

**Requirements**:
- Always show dry-run preview first
- Require confirmation before deleting
- Preserve phase READMEs and all templates
- Reset CURRENT_FOCUS.md and DECISIONS.md to template state

## What Gets REMOVED

Project-specific files to delete:
```
docs/PRD.md                         # Project requirements
docs/PRD_*.md                       # Named PRD files
docs/TECH_STACK.md                  # Technology choices
docs/ARCHITECTURE_GUIDE.md          # Architecture decisions
docs/DESIGN_SYSTEM.md               # Design tokens
docs/PRODUCTION_ROADMAP.md          # Project roadmap
docs/phases/phase*/PHASE*_TASKS.md  # Task breakdowns
```

Files to reset (restore to template state):
```
CURRENT_FOCUS.md                    # Reset to placeholder
docs/DECISIONS.md                   # Reset to template with example ADR only
```

## What Gets PRESERVED

Template infrastructure (never touched):
```
README.md                           # Project README
VIBE_CODING_SEED.md                 # Core methodology
TOOLS_PREFERENCE.md                 # Tool preferences
docs/COMMANDS.md                    # Commands guide
docs/phases/README.md               # Phase overview
docs/phases/phase*/README.md        # Phase READMEs (structure)
docs/phases/templates/*             # All task templates
docs/templates/PRD_TEMPLATE.md      # PRD template
.claude/skills/*                    # All skills
.cursor/commands/*                  # All commands
.vscode/prompts/*                   # All prompts
```

## Process

### Step 1: Dry Run Preview

Show what will be deleted/reset without making changes:
```
## Cleanup Preview

### Files to DELETE:
- docs/PRD.md
- docs/TECH_STACK.md
- ...

### Files to RESET:
- CURRENT_FOCUS.md
- docs/DECISIONS.md

### Files PRESERVED:
- docs/phases/phase1/README.md ✓
- docs/templates/* ✓

Proceed with cleanup? [y/N]
```

### Step 2: Execute (after confirmation)

1. Delete project-specific files
2. Reset CURRENT_FOCUS.md to:
   ```markdown
   # Current Focus

   **Phase**: Not started
   **Task**: None
   **Status**: ⏳ Ready to begin

   **Next up**: Run `/kickstart` to initialize project
   ```
3. Reset DECISIONS.md - keep only template and example ADR-001

### Step 3: Summary

Report what was deleted, reset, and preserved.

## Safety

- Always dry-run first
- Require explicit confirmation
- Check for uncommitted git changes first
- Never touch templates or phase READMEs

**Output**: Clean template ready for `/kickstart`
