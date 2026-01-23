---
name: remember
description: Capture and persist learnings globally across all projects
argument-hint: "[category:] <learning>"
---

# Remember - Global Knowledge Capture

Persist learnings to `~/.claude/knowledge/` and sync to vibeSeed repo.

## Usage

```
# With explicit category
/remember typescript: Always use Zod for runtime validation in API handlers
/remember testing: Prefer integration tests over unit tests for API routes

# Without category (auto-detected)
/remember Always use Zod for runtime validation  → detects "typescript"
/remember Create feature branch for each phase   → detects "process"
```

## Instructions

1. **Parse the input** from $ARGUMENTS
   - Format: `<category>: <learning>` or just `<learning>`
   - Category should be lowercase, single word

2. **Auto-categorize if no category specified**

   If input doesn't contain `category:` prefix, analyze the content and pick the best category:

   | Category | Keywords/Patterns |
   |----------|-------------------|
   | typescript | Zod, types, interfaces, generics, TypeScript, TS, strict mode |
   | react | components, hooks, useState, useEffect, JSX, props, Zustand |
   | tailwind | CSS, styling, classes, responsive, Tailwind, utility classes |
   | testing | tests, Jest, Vitest, coverage, mocks, assertions, TDD |
   | architecture | monorepo, feature-based, modules, structure, patterns, DDD |
   | database | SQL, queries, Drizzle, migrations, PostgreSQL, indexes |
   | ai | LLM, prompts, Claude, GPT, embeddings, AI providers |
   | devops | Docker, CI/CD, deployment, pnpm, builds, infrastructure |
   | process | git, branches, phases, workflow, ADRs, documentation |
   | general | (fallback if no clear match) |

   **Important**: After detecting category, briefly confirm with user:
   > Detected category: `typescript`. Saving: "Always use Zod..."
   > [Proceed unless user objects]

3. **Validate the category**
   - Use detected or explicit category
   - Create new category file if it doesn't exist

3. **Append to knowledge file**
   - File: `~/.claude/knowledge/<category>.md`
   - Format each entry with date:
   ```markdown
   - [2024-01-15] <learning>
   ```

4. **Update the index**
   - Ensure `~/.claude/knowledge/README.md` lists all categories

5. **Sync to vibeSeed** (if configured)
   - Copy knowledge directory to local vibeSeed clone
   - Commit and push changes
   - VibeSeed path: `~/workspace/vibeSeed` (adjust if different)

6. **Confirm to user**
   - Show what was saved and where
   - Indicate if vibeSeed sync succeeded

## Knowledge File Format

Each `~/.claude/knowledge/<category>.md`:

```markdown
# <Category> Learnings

Accumulated knowledge about <category> from project experience.

## Entries

- [YYYY-MM-DD] Learning 1
- [YYYY-MM-DD] Learning 2
```

## Index Format

`~/.claude/knowledge/README.md`:

```markdown
# Knowledge Index

Reference these files for domain-specific learnings.

| Category | File | Description |
|----------|------|-------------|
| typescript | typescript.md | TypeScript patterns and practices |
| testing | testing.md | Testing strategies and tools |
```

## VibeSeed Sync

After saving locally, sync to vibeSeed:

```bash
# Copy knowledge to vibeSeed
cp -r ~/.claude/knowledge ~/workspace/vibeSeed/.claude/

# Commit and push
cd ~/workspace/vibeSeed
git add .claude/knowledge
git commit -m "knowledge: Update from $(hostname)"
git push
```

## Input to process

$ARGUMENTS
