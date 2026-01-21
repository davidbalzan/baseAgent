---
mode: edit
description: Update CURRENT_FOCUS.md with session progress
---

# Update Focus - Session Progress Recorder

Update CURRENT_FOCUS.md to capture session progress for future context.

## Instructions

1. **Read CURRENT_FOCUS.md** to understand existing state
2. **Gather session progress** from conversation context
3. **Update the file** with:
   - Phase and task (if changed)
   - Quick Context: Done, Next, Blockers
   - Last Updated date

## CURRENT_FOCUS.md Format

```markdown
# Current Focus

> **Quick reference for AI assistants and team members to instantly know where work stands.**

---

## 🎯 Active Work

**Phase**: Phase N - [Phase Name]  
**Task**: Task X.Y - [Task Name]  
**Sub-step**: X.Y.Z - [Sub-step description]  
**Branch**: `feature/[branch-name]`

---

## 📍 Quick Context

**What we're doing**: [Current work description]

**Why**: [Reason/motivation]

**Blocked by**: [Blockers or "Nothing - clear to proceed"]

**Next up**: [Next task/step]

---

## 🔗 Key Files

- Task details: `docs/phases/phaseN/PHASEN_TASKS.md`
- Phase overview: `docs/phases/phaseN/README.md`

---

## 📝 Session Notes

_Add notes here during work sessions. Clear when starting new task._

- [ ] Pending item
- [x] Completed item

---

## 🕐 Last Updated

**Date**: YYYY-MM-DD  
**By**: [Name/AI]  
**Status**: 🚧 In Progress
```

## Update Guidelines

- Keep entries concise and scannable
- Use consistent status indicators:
  - ✅ Complete
  - 🚧 In Progress
  - ⏳ Not Started
- Date format: YYYY-MM-DD
- Clear session notes when starting a new task

## After Updating

Confirm the changes made and show the updated status to the user.
