---
name: remember
description: Capture and persist learnings globally across all projects
argument-hint: "<category>: <learning>"
---

# Remember - Global Knowledge Capture

Persist learnings to `~/.claude/knowledge/` and sync to vibeSeed repo.

## Usage

```
/remember typescript: Always use Zod for runtime validation in API handlers
/remember testing: Prefer integration tests over unit tests for API routes
/remember architecture: Keep feature modules self-contained with co-located types
```

## Instructions

1. **Parse the input** from $ARGUMENTS
   - Format: `<category>: <learning>` or just `<learning>` (defaults to "general")
   - Category should be lowercase, single word (typescript, testing, architecture, etc.)

2. **Validate the category**
   - Common categories: typescript, testing, architecture, react, tailwind, database, ai, devops, general
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
