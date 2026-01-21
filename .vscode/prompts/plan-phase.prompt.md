---
mode: edit
description: Generate a new phase task document using the project template
---

# Plan Phase - Task Document Generator

Generate a comprehensive phase task document following the vibe coding methodology.

## Instructions

Follow the 6-stage approach:

### Stage 1: Initial Discovery & Project Scope
- Read existing phase documentation
- Understand the phase goals and context
- Review docs/PRODUCTION_ROADMAP.md for phase objectives

### Stage 2: Deep Technical Analysis
- Explore relevant codebase areas
- Identify existing patterns to follow
- Review ARCHITECTURE_GUIDE.md for constraints
- Check TECH_STACK.md for technology requirements

### Stage 3: Impact & Risk Analysis
- Identify dependencies on other phases
- Assess risks and mitigation strategies
- Note potential blockers

### Stage 4: Detailed Component Inventory
- List all components to create/modify
- Map to packages (client/server)
- Identify shared types and interfaces

### Stage 5: Task Planning & Sequencing
- Break into 4-6 major tasks
- Each task gets 3-7 sub-steps
- Assign priorities (CRITICAL/HIGH/MEDIUM/LOW)
- Define dependencies between tasks

### Stage 6: Success Criteria & Validation
- Define functional success criteria
- Define technical success criteria
- Define quality success criteria

## Template Structure

Use `docs/phases/templates/TASK_TEMPLATE.md` as the base.

Create files:
- `docs/phases/phaseN/README.md` - Phase overview
- `docs/phases/phaseN/PHASEN_TASKS.md` - Detailed tasks

## Task Format

Each task should include:

```markdown
### Task N: [Task Name]

**Priority**: [CRITICAL/HIGH/MEDIUM/LOW]
**Package**: [client/server/shared]
**Dependencies**: [Task numbers or "None"]

#### Sub-tasks
- [ ] N.1 [First sub-task]
- [ ] N.2 [Second sub-task]
- [ ] N.3 [Third sub-task]

#### Deliverables
- [What this task produces]

#### Rollback Plan (if high-risk)
- [How to revert if needed]
```

## Output

1. Generate the phase README
2. Generate the detailed tasks file
3. Update docs/PRODUCTION_ROADMAP.md to include the new phase
4. Summarize what was created
