---
mode: edit
description: Create an Architectural Decision Record in DECISIONS.md
---

# Log Decision - ADR Creator

Create an Architectural Decision Record (ADR) in docs/DECISIONS.md.

## Instructions

1. **Read docs/DECISIONS.md** to get the current ADR count and format
2. **Gather decision details** from the user
3. **Create new ADR entry** following the established format
4. **Update the ADR index table** at the top of the file

## Required Information

Ask the user for any missing information:

- **Title**: Short descriptive name for the decision
- **Context**: What problem or situation prompted this decision?
- **Decision**: What was decided?
- **Consequences**: Positive impacts, negative trade-offs, risks
- **Alternatives Considered**: What other options were evaluated?

## ADR Format Template

```markdown
## ADR-XXX: [Decision Title]

**Status**: ✅ Accepted  
**Date**: YYYY-MM-DD  
**Deciders**: [Who was involved]

### Context

[What is the issue that we're seeing that is motivating this decision?]

### Decision

[What is the change that we're proposing and/or doing?]

### Consequences

**Positive:**
- [Benefit 1]
- [Benefit 2]

**Negative:**
- [Trade-off 1]
- [Trade-off 2]

**Risks:**
- [Risk to monitor]

### Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| [Option 1] | ... | ... | ... |
| [Option 2] | ... | ... | ... |
```

## Key Rules

- ADRs are **immutable** - don't edit old decisions
- To change a decision, create a new ADR and mark the old one as "🔄 Superseded by ADR-XXX"
- Always increment the ADR number
- Use date format: YYYY-MM-DD

## After Creating

Update the index table at the top of DECISIONS.md:

```markdown
| ID | Decision | Status | Date |
|----|----------|--------|------|
| ADR-XXX | [Title] | ✅ Accepted | YYYY-MM-DD |
```
