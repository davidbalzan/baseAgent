---
name: distill
description: Convert a learning into a formal ADR in the current project
argument-hint: "[category] or <learning text>"
---

# Distill - Learning to ADR Converter

Convert accumulated learnings from `~/.claude/knowledge/` into formal Architectural Decision Records for the current project.

## Usage

```
# Browse learnings from a category
/distill typescript

# Distill a specific learning
/distill Use Hono for TypeScript-first APIs

# Interactive mode - show all categories
/distill
```

## Instructions

1. **Determine mode from $ARGUMENTS**

   - If empty: Show available categories with entry counts
   - If category name: List learnings from that category
   - If learning text: Search for matching learning and distill it

2. **Show learnings and let user pick**

   ```
   ## TypeScript Learnings (3 entries)

   1. Use Hono for TypeScript-first APIs with native OpenAPI generation
   2. Use Drizzle ORM for type-safe SQL queries with PostgreSQL
   3. Add Zod schemas to all API endpoints for runtime validation

   Which learning to distill? (number or 'cancel')
   ```

3. **Gather ADR context through conversation**

   Ask the user:
   - **Context**: What problem or situation led to this becoming a pattern?
   - **Alternatives**: What other approaches were considered?
   - **Consequences**: What are the trade-offs (positive and negative)?

4. **Generate ADR in standard format**

   ```markdown
   ### ADR-XXX: [Decision Title derived from learning]

   **Date**: YYYY-MM-DD
   **Status**: Accepted
   **Source**: Distilled from learning

   #### Context
   [Problem/situation that motivated this decision]

   #### Decision
   [The learning, expanded into a decision statement]

   #### Consequences

   **Positive:**
   - [Benefit 1]
   - [Benefit 2]

   **Negative:**
   - [Trade-off 1]
   - [Trade-off 2]

   #### Alternatives Considered

   | Alternative | Pros | Cons | Why Not Chosen |
   |-------------|------|------|----------------|
   | [Option 1] | [Pros] | [Cons] | [Reason] |
   ```

5. **Append to project's DECISIONS.md**

   - Look for `docs/DECISIONS.md` in current project
   - Read existing file to get next ADR number
   - Append new ADR
   - Update index table at top

6. **Confirm to user**

   - Show the generated ADR
   - Confirm it was added to DECISIONS.md
   - Optionally mark the learning as "distilled" in knowledge file

## Finding DECISIONS.md

Search in order:
1. `./docs/DECISIONS.md`
2. `./DECISIONS.md`
3. Ask user for path if not found

## ADR Numbering

- Read existing DECISIONS.md
- Find highest ADR-XXX number
- Increment by 1 for new ADR

## Input to process

$ARGUMENTS
