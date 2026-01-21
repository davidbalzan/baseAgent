# Check Task - Progress Tracker

Mark tasks as complete in phase task files and update progress metrics.

## Instructions

1. **Identify the current phase** from docs/PRODUCTION_ROADMAP.md (Current Focus section)
2. **Read the phase tasks file** (docs/phases/phaseN/PHASEN_TASKS.md)
3. **Find the task** specified by the user
4. **Update the checkbox** from `[ ]` to `[x]`
5. **Update progress metrics** in the file if they exist
6. **Report completion** to the user

## Task Identification

The user may specify a task by:
- Task number (e.g., "1.3" for Task 1, sub-step 3)
- Task description (e.g., "implement auth middleware")
- Partial match (fuzzy search for the task)

## Checkbox Format

```markdown
Before: - [ ] Implement user authentication
After:  - [x] Implement user authentication
```

## Progress Section Update

If the file has a progress tracking section, update the metrics:

```markdown
## Progress Tracking

**Overall Progress**: X/Y tasks (Z%)

| Task | Status | Completion |
|------|--------|------------|
| Task 1 | ✅ Complete | 100% |
| Task 2 | 🚧 In Progress | 60% |
```

## Cascade Updates

After marking a task complete:

1. Check if all sub-tasks in a task group are done
2. If so, mark the parent task as complete
3. Check if all tasks in the phase are done
4. If so, suggest updating PRODUCTION_ROADMAP.md

## Output

Confirm:
- Which task was marked complete
- Updated progress percentage
- Remaining tasks in current group
- Any suggested next actions
