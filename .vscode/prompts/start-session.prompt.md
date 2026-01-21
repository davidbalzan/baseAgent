---
mode: ask
description: Load project context from vibe coding docs at the start of a session
---

# Start Session - Vibe Coding Context Loader

Load instant context from the vibe coding documentation to understand current project state.

## Instructions

1. **Read CURRENT_FOCUS.md** first - quick reference for active work
2. **Read docs/PRODUCTION_ROADMAP.md** - the "Current Focus" section at the top is the primary entry point
3. **Read the active phase README** - get context on current phase goals
4. **Read the active phase TASKS file** - understand specific task breakdown
5. **Read docs/DECISIONS.md** - check for recent or relevant ADRs

## Output Format

Provide a concise summary:

```markdown
## Session Context

**Active Phase**: Phase N - [Name]
**Current Task**: [Task description]
**Status**: [In Progress / Blocked / etc.]

### Recent Progress
- [What was completed]

### Recent Decisions
- ADR-XXX: [Title] - [Brief impact on current work]

### Blockers
- [Any blocking items, or "None"]

### Suggested Next Steps
1. [First priority]
2. [Second priority]
```

## Status Indicators to Look For

- ✅ Complete
- 🚧 In Progress
- ⏳ Not Started
- 🔴 Critical Priority

## Decision Relevance

When surfacing decisions:
- Show ADRs from the last 30 days
- Highlight any decisions related to the current phase
- Note any "Proposed" decisions awaiting confirmation
