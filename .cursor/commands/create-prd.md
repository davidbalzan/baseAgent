# Create PRD - Product Requirements Document

**Objective**: Generate a comprehensive PRD through a 6-stage guided discovery process.

**Requirements**:
- Ask questions at each stage before proceeding
- Use the template at `docs/templates/PRD_TEMPLATE.md`
- Be specific and testable in all requirements
- Prioritize using MoSCoW (Must/Should/Could/Won't Have)

## Stage 1: Problem Discovery

Ask the user:
1. What problem are you solving? (specific, concrete examples)
2. Who experiences this problem? (user personas)
3. How do they solve it today? (current workarounds)
4. Why does this matter now? (business context)

Capture: Problem statement, affected users, alternatives, business impact.

## Stage 2: Vision & Goals

Ask the user:
1. What does success look like?
2. How will you measure success? (specific metrics)
3. What are you NOT building? (scope boundaries)
4. What's the timeline?

Capture: Vision statement, 3-5 measurable goals, non-goals, timeline.

## Stage 3: User Requirements

For each persona:
1. What are their goals?
2. What are their pain points?
3. What's their technical level?

Generate user stories: "As a [persona], I want to [action] so that [benefit]"

Prioritize with MoSCoW:
- **Must Have**: MVP blockers
- **Should Have**: Important but not critical
- **Could Have**: Nice to have
- **Won't Have**: Explicitly deferred

## Stage 4: Functional Requirements

For each Must Have story:
1. Break into discrete features
2. Define acceptance criteria (specific, testable)
3. Map user flows
4. Identify dependencies

## Stage 5: Non-Functional & Technical

Ask about:
1. Performance expectations (response times, concurrent users)
2. Security requirements (auth, compliance)
3. Scalability needs (initial scale, growth projections)
4. Technology constraints (existing stack, team skills)
5. Integration requirements (external systems)

## Stage 6: Risks & Planning

Identify:
1. Technical risks
2. Business risks
3. Dependencies
4. Assumptions

Create risk matrix and high-level phase breakdown.

**Output**: Complete PRD saved to `docs/PRD.md` (or `docs/PRD_[ProductName].md`).
