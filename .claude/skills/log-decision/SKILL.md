---
name: log-decision
description: Create an Architectural Decision Record in DECISIONS.md
disable-model-invocation: true
argument-hint: "<decision title>"
---

# Log Decision - ADR Creator

Create an Architectural Decision Record (ADR) in docs/DECISIONS.md.

## Instructions

1. **Read docs/DECISIONS.md** to get the current ADR count and format
2. **Gather decision details** through conversation or from $ARGUMENTS
3. **Create new ADR entry** following the established format
4. **Update the ADR index table** at the top of the file

## Required Information

Ask the user for any missing information:

- **Title**: Short descriptive name for the decision
- **Context**: What problem or situation prompted this decision?
- **Decision**: What was decided?
- **Consequences**:
  - Positive impacts
  - Negative trade-offs
  - Risks to monitor
- **Alternatives Considered**: What other options were evaluated?

## ADR Format Template

```markdown
### ADR-XXX: [Decision Title]

**Date**: YYYY-MM-DD
**Status**: Accepted | Proposed | Superseded by ADR-XXX

#### Context
[What is the issue that we're seeing that is motivating this decision?]

#### Decision
[What is the change that we're proposing and/or doing?]

#### Consequences

**Positive:**
- [Benefit 1]
- [Benefit 2]

**Negative:**
- [Trade-off 1]
- [Trade-off 2]

**Risks:**
- [Risk to monitor]

#### Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| [Option 1] | [Pros] | [Cons] | [Reason] |
| [Option 2] | [Pros] | [Cons] | [Reason] |
```

## Key Rules

- ADRs are **immutable** - don't edit old decisions
- To change a decision, create a new ADR and mark the old one as "Superseded by ADR-XXX"
- Always increment the ADR number
- Include code examples in "Interface Design" section if relevant

## Index Table Format

Update the table at the top of DECISIONS.md:

```markdown
| ID | Title | Status | Date |
|----|-------|--------|------|
| ADR-XXX | [Title] | Accepted | YYYY-MM-DD |
```

Decision to log: $ARGUMENTS
