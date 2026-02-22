# Agent Context

## Workspace Structure

```
workspace/
  SOUL.md              — Core identity and personality
  SOUL_COMPACT.md      — Compact version for cheap models
  CONTEXT.md           — This file (project structure, patterns)
  PERSONALITY.md       — Tone and communication style
  HEARTBEAT.md         — Scheduled heartbeat task definitions
  SCHEDULED_TASKS.json — Persisted scheduled tasks
  tool-groups.json     — Tool group definitions for capability filtering
  users/
    david/
      USER.md          — David's preferences and context
      MEMORY.md        — David's long-term agent memories
  skills/
    project-health-check/  — Runs git, test, build, audit checks
      handler.ts
      manifest.json
```

## Key Paths

- **Config**: `config/default.yaml`
- **Core loop**: `packages/core/src/loop/agent-loop.ts`
- **Reflection**: `packages/core/src/loop/reflection.ts`
- **Scheduler**: `packages/plugin-scheduler/src/scheduler.ts`
- **Server bootstrap**: `packages/server/src/bootstrap.ts`
- **Dashboard**: `packages/server/src/dashboard/index.html`

## Operational Notes

- Use `file_list` to verify paths before `file_read` on unfamiliar directories
- Skills live under `workspace/skills/<name>/` — do not guess skill names, list the directory
- Memory files are hot-reloaded every session — edits take effect immediately
- The `project-health-check` skill (formerly `proactive-monitoring`) handles health checks

<!-- context-key: self_improvement_patterns -->
## Token Usage Patterns

- Average ~40K prompt tokens per session
- High-token sessions may benefit from tool grouping
- Break down complex tasks into smaller steps
<!-- /context-key: self_improvement_patterns -->
