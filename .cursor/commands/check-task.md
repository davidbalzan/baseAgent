# Check Task - Task Completion Tracker

**Objective**: Mark tasks as complete in phase task documents and update related files.

**Requirements**:
- Read the relevant phase task file first
- Update checkbox status
- Update progress statistics
- Optionally update `CURRENT_FOCUS.md`

## Process

1. **Identify the task file**: `docs/phases/phaseN/PHASEN_TASKS.md`
2. **Find the task/sub-task**: Locate by task number (e.g., 2.3, 3.1.2)
3. **Update checkbox**: Change `- [ ]` to `- [x]`
4. **Update statistics**: Update progress counts in header section
5. **Add completion notes** (if significant):
   ```markdown
   **✅ COMPLETION NOTES**:
   - [What was done]
   - [Any relevant details]
   - Commit: [hash]
   ```

## Checkbox Syntax

```markdown
- [ ] Incomplete task
- [x] Completed task
```

## Progress Header Format

```markdown
### 📈 Current Progress
- ✅ Sprint 1 (Foundation): 100% complete (4/4 tasks)
- 🚧 Sprint 2 (Features): 50% complete (2/4 tasks)
- ⏳ Sprint 3 (Polish): 0% complete (0/3 tasks)

**Components Implemented:** 6 / 10 (60%)
```

## Status Updates

When marking complete:
- Update task status from 🚧 to ✅
- Update sprint/phase percentages
- Update "Components Implemented" count

## Related Updates

After marking complete, consider:
1. Update `CURRENT_FOCUS.md` to next task
2. Update phase README if sprint complete
3. Update `docs/PRODUCTION_ROADMAP.md` if phase complete

**Output**: Updated task file with completion status and statistics.
