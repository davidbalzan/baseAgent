# Knowledge Index

Domain-specific learnings accumulated from project experience. Reference these files for patterns and best practices.

## Categories

| Category | File | Description |
|----------|------|-------------|
| general | [general.md](general.md) | General development practices |
| typescript | [typescript.md](typescript.md) | TypeScript patterns and practices |
| react | [react.md](react.md) | React component patterns |
| tailwind | [tailwind.md](tailwind.md) | Tailwind CSS styling patterns |
| testing | [testing.md](testing.md) | Testing strategies and tools |
| architecture | [architecture.md](architecture.md) | System design and structure |
| database | [database.md](database.md) | Database patterns and queries |
| ai | [ai.md](ai.md) | AI integration patterns |
| devops | [devops.md](devops.md) | Deployment and infrastructure |

## Usage

These files are automatically updated via `/remember` command:

```
/remember typescript: Always use Zod for runtime validation
/remember testing: Prefer integration tests for API routes
```

## How It Works

Knowledge is stored **globally** at `~/.claude/knowledge/` so it's available across all projects.

The `/remember` skill:
1. Appends to `~/.claude/knowledge/<category>.md`
2. Syncs back to vibeSeed for backup/sharing

## Setup for New Machines

```bash
# Copy skill and knowledge to global location
cp -r .claude/skills/remember ~/.claude/skills/
cp -r .claude/knowledge ~/.claude/
```
