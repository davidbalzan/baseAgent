# Plan Phase - Task Document Generator

**Objective**: Generate a comprehensive phase task document following the vibe coding methodology.

**Requirements**:
- Follow the 6-stage approach below
- Use templates from `docs/phases/templates/`
- Create specific, actionable tasks with checkboxes
- Include risk assessment and rollback plans for complex tasks

## Stage 1: Initial Discovery

1. Read existing phase documentation
2. Understand phase goals and context
3. Review `docs/PRODUCTION_ROADMAP.md` for phase objectives

## Stage 2: Deep Technical Analysis

1. Explore relevant codebase areas
2. Identify existing patterns to follow
3. Review `docs/ARCHITECTURE_GUIDE.md` for constraints
4. Check `docs/TECH_STACK.md` for technology requirements

## Stage 3: Impact & Risk Analysis

1. Identify dependencies on other phases
2. Assess risks and mitigation strategies
3. Note potential blockers

## Stage 4: Detailed Component Inventory

1. List all components to create/modify
2. Map to packages (client/server)
3. Identify shared types and interfaces

## Stage 5: Task Planning & Sequencing

1. Break into 4-6 major tasks
2. Each task gets 3-7 sub-steps
3. Assign priorities (CRITICAL/HIGH/MEDIUM/LOW)
4. Define dependencies between tasks

### Task Format

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

## Stage 6: Success Criteria

Define:
- Functional success criteria
- Technical success criteria
- Quality success criteria (test coverage, performance)

**Output**:
1. `docs/phases/phaseN/README.md` - Phase overview
2. `docs/phases/phaseN/PHASEN_TASKS.md` - Detailed task breakdown
3. Update `docs/PRODUCTION_ROADMAP.md` with new phase
