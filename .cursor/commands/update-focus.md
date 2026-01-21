# Update Focus - Current Work Tracker

**Objective**: Update `CURRENT_FOCUS.md` to reflect current work state.

**Requirements**:
- Read current `CURRENT_FOCUS.md` first
- Update all relevant sections
- Set the "Last Updated" timestamp
- Clear session notes if moving to a new task

## File Location

`CURRENT_FOCUS.md` at project root.

## Sections to Update

### Active Work
```markdown
**Phase**: Phase N - [Name]
**Task**: Task N.X - [Task Name]
**Sub-step**: N.X.Y - [Sub-step description]
**Branch**: `feature/[branch-name]`
```

### Quick Context
```markdown
**What we're doing**: [Current activity]
**Why**: [Reason/goal]
**Blocked by**: [Blocker or "Nothing - clear to proceed"]
**Next up**: [Next task after this]
```

### Key Files
```markdown
- Task details: `docs/phases/phaseN/PHASEN_TASKS.md`
- Phase overview: `docs/phases/phaseN/README.md`
```

### Session Notes
```markdown
- [x] [Completed item]
- [ ] [Pending item]
```

Clear these notes when starting a new task.

### Last Updated
```markdown
**Date**: YYYY-MM-DD
**Status**: 🚧 In Progress | ✅ Complete | ⏸️ Paused
```

## When to Update

- Start of each work session
- After completing a major task or sub-step
- When encountering or resolving blockers
- End of session (capture progress)

**Output**: Updated `CURRENT_FOCUS.md` with current state.
