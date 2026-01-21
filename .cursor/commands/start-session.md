# Start Session - Context Loader

**Objective**: Load project context from vibe coding documentation to understand current state and provide a session summary.

**Requirements**:
- Read documentation files in the specified order
- Summarize current state concisely
- Highlight blockers and next steps
- Surface recent decisions that affect current work

## Files to Read (in order)

1. `CURRENT_FOCUS.md` - Quick reference for active work
2. `docs/PRODUCTION_ROADMAP.md` - Overall progress and phase status
3. Active phase README (e.g., `docs/phases/phase2/README.md`)
4. Active phase TASKS file (e.g., `docs/phases/phase2/PHASE2_TASKS.md`)
5. `docs/DECISIONS.md` - Recent ADRs

## Status Indicators

- ✅ Complete
- 🚧 In Progress
- ⏳ Not Started
- 🔴 Critical Priority
- 🟡 Medium Priority
- 🟢 Low Priority

## Output Format

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

## Decision Relevance

When surfacing decisions:
- Show ADRs from the last 30 days
- Highlight decisions related to current phase
- Note any "Proposed" decisions awaiting confirmation
- Flag decisions that constrain current task options

**Output**: Concise session summary with actionable next steps.
