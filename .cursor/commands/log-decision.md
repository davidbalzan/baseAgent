# Log Decision - ADR Creator

**Objective**: Create an Architectural Decision Record (ADR) in `docs/DECISIONS.md`.

**Requirements**:
- Read existing ADRs to get the current count and format
- Gather all required information before writing
- Follow the established ADR format
- Update the index table at the top of the file

## Required Information

Ask for any missing details:

1. **Title**: Short descriptive name
2. **Context**: What problem/situation prompted this decision?
3. **Decision**: What was decided?
4. **Consequences**:
   - Positive impacts
   - Negative trade-offs
   - Risks to monitor
5. **Alternatives Considered**: Other options evaluated with pros/cons

## ADR Format

```markdown
## ADR-XXX: [Decision Title]

**Status**: ✅ Accepted
**Date**: YYYY-MM-DD
**Deciders**: [Who was involved]

### Context

[What issue motivated this decision?]

### Decision

[What change are we making?]

### Consequences

**Positive:**
- [Benefit 1]
- [Benefit 2]

**Negative:**
- [Trade-off 1]
- [Trade-off 2]

**Risks:**
- [Risk and mitigation]

### Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| [Option 1] | ... | ... | ... |
| [Option 2] | ... | ... | ... |
```

## Index Table

Update the table at the top of `docs/DECISIONS.md`:

```markdown
| ID | Decision | Status | Date |
|----|----------|--------|------|
| ADR-XXX | [Title](#adr-xxx-title) | ✅ Accepted | YYYY-MM-DD |
```

## Key Rules

- ADRs are **immutable** - never edit old decisions
- To change a decision: create new ADR, mark old as "🔄 Superseded by ADR-XXX"
- Always increment the ADR number
- Include code examples if relevant

**Output**: New ADR entry added to `docs/DECISIONS.md` with updated index.
