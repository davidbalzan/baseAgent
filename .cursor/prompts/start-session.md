# Start Session - Vibe Coding Context Loader

Load instant context from the vibe coding documentation to understand current project state.

## Instructions

1. **Read docs/PRODUCTION_ROADMAP.md** first - the "Current Focus" section at the top is the primary entry point
2. **Read the active phase README** - get context on current phase goals
3. **Read the active phase TASKS file** - understand specific task breakdown
4. **Read docs/DECISIONS.md** - check for recent or relevant ADRs
5. **Summarize for the user**:
   - Current phase and task in progress
   - What's been completed recently
   - What's blocked or needs attention
   - Recent architectural decisions that affect current work
   - Suggested next steps

## Key Files

- `docs/PRODUCTION_ROADMAP.md` - **Single source of truth** (Current Focus section at top + phase overview)
- `docs/phases/phaseN/README.md` - Current phase overview
- `docs/phases/phaseN/PHASEN_TASKS.md` - Detailed task breakdown
- `docs/DECISIONS.md` - Architectural Decision Records

## Status Indicators to Look For

- ✅ Complete
- 🚧 In Progress
- ⏳ Not Started
- 🔴 Critical Priority
- 🟡 Medium Priority
- 🟢 Low Priority

## Output Format

Provide a concise summary:

```
## Session Context

**Active Phase**: Phase N - [Name]
**Current Task**: [Task description]
**Status**: [In Progress / Blocked / etc.]

### Recent Progress
- [What was completed]

### Recent Decisions
- ADR-XXX: [Title] - [Brief impact on current work]

### Blockers
- [Any blocking items]

### Suggested Next Steps
1. [First priority]
2. [Second priority]
```

## Decision Relevance

When surfacing decisions:
- Show ADRs from the last 30 days
- Highlight any decisions related to the current phase
- Note any "Proposed" decisions awaiting confirmation
- Flag any decisions that might constrain current task options
