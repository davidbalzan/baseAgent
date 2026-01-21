---
name: create-prd
description: Generate a comprehensive Product Requirements Document through guided discovery
disable-model-invocation: true
argument-hint: "<product name or idea>"
---

# Create PRD - Product Requirements Document Generator

Generate a comprehensive PRD through a structured discovery process. This skill guides you through requirements gathering and produces a production-ready PRD document.

## Instructions

This skill follows a 6-stage discovery process to build a complete PRD.

### Stage 1: Problem Discovery

Ask the user about:
1. **What problem are you solving?** - Get specific, concrete examples
2. **Who experiences this problem?** - Identify user personas
3. **How do they solve it today?** - Current workarounds and pain points
4. **Why does this matter now?** - Business context and urgency

Capture:
- Problem statement (concrete, measurable)
- Affected user segments
- Current alternatives/competitors
- Business impact

### Stage 2: Vision & Goals

Ask the user about:
1. **What does success look like?** - The ideal outcome
2. **How will you measure success?** - Specific metrics and targets
3. **What are you NOT building?** - Explicit scope boundaries
4. **What's the timeline?** - Key dates and constraints

Capture:
- Product vision statement
- 3-5 measurable goals with targets
- Non-goals / out of scope items
- Timeline constraints

### Stage 3: User Requirements

For each persona identified:
1. **What are their goals?** - What they're trying to achieve
2. **What are their pain points?** - Current frustrations
3. **What's their technical level?** - Expertise and expectations

Then generate user stories in format:
```
As a [persona], I want to [action] so that [benefit]
```

Prioritize using MoSCoW:
- **Must Have**: Core functionality, MVP blockers
- **Should Have**: Important but not critical
- **Could Have**: Nice to have, enhances experience
- **Won't Have**: Explicitly deferred

### Stage 4: Functional Requirements

For each Must Have user story:
1. **Break into features** - Discrete pieces of functionality
2. **Define acceptance criteria** - Specific, testable conditions
3. **Map user flows** - Step-by-step interactions
4. **Identify dependencies** - What depends on what

### Stage 5: Non-Functional & Technical Requirements

Ask about:
1. **Performance expectations** - Response times, concurrent users
2. **Security requirements** - Auth, data protection, compliance
3. **Scalability needs** - Initial scale, growth projections
4. **Technology constraints** - Existing stack, team skills, budget
5. **Integration requirements** - External systems, APIs

### Stage 6: Risks & Planning

Identify:
1. **Technical risks** - Complexity, unknowns
2. **Business risks** - Market, timeline, resources
3. **Dependencies** - External factors
4. **Assumptions** - What we're taking for granted

Create:
- Risk matrix with mitigations
- High-level phase breakdown
- Key milestones

## Output

Generate the PRD using the template at `docs/templates/PRD_TEMPLATE.md`.

Save the completed PRD to: `docs/PRD.md` (or `docs/PRD_[ProductName].md` if specified)

## Conversation Flow

```
1. Greet and explain the process
2. Stage 1: Problem Discovery (ask questions, summarize)
3. Stage 2: Vision & Goals (ask questions, summarize)
4. Stage 3: User Requirements (generate personas & stories)
5. Stage 4: Functional Requirements (define features)
6. Stage 5: Non-Functional Requirements (capture constraints)
7. Stage 6: Risks & Planning (identify risks, create roadmap)
8. Generate complete PRD document
9. Review and iterate with user
```

## Tips for Good PRDs

- **Be specific**: "Fast" is not a requirement; "<200ms API response" is
- **Be testable**: Every requirement should have clear pass/fail criteria
- **Prioritize ruthlessly**: Not everything can be a "Must Have"
- **Capture the "why"**: Context helps future decisions
- **Identify risks early**: What could go wrong?
- **Define non-goals**: What you won't do is as important as what you will

## Related Skills

After completing the PRD, use:
- `/plan-phase` - Break down into implementation phases
- `/log-decision` - Record key technical decisions as ADRs

## Product to document: $ARGUMENTS
