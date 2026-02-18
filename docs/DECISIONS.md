# Architectural Decision Records (ADRs)

> **Document the "why" behind significant technical decisions.**

ADRs capture context that's easy to forget: why we chose X over Y, what constraints existed, and what trade-offs we accepted. Future team members (and AI assistants) will thank you.

---

## Decision Log

| ID | Decision | Status | Date |
|----|----------|--------|------|
| ADR-001 | [Use Monorepo Structure](#adr-001-use-monorepo-structure) | Accepted | 2026-02-18 |
| ADR-002 | [Inherit vibeSeed Methodology](#adr-002-inherit-vibeseed-methodology) | Accepted | 2026-02-18 |
| ADR-003 | [Use SQLite for All Persistence](#adr-003-use-sqlite-for-all-persistence) | Accepted | 2026-02-18 |

---

## ADR Template

When adding a new decision, copy this template:

```markdown
## ADR-XXX: [Title]

**Status**: Proposed | Accepted | Rejected | Superseded by ADR-XXX
**Date**: YYYY-MM-DD
**Deciders**: [Who was involved]

### Context

What is the issue that we're seeing that is motivating this decision or change?

### Decision

What is the change that we're proposing and/or doing?

### Consequences

**Positive:**
- Benefit 1
- Benefit 2

**Negative:**
- Trade-off 1
- Trade-off 2

**Risks:**
- Risk and mitigation

### Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| Option A | ... | ... | ... |
| Option B | ... | ... | ... |
```

---

## ADR-001: Use Monorepo Structure

**Status**: Accepted
**Date**: 2026-02-18
**Deciders**: Project architecture

### Context

baseAgent has multiple subsystems (agent loop, gateway, memory, tools, dashboard) that share types, configuration, and development tooling. We need to decide between a monorepo with package boundaries or separate repositories.

### Decision

Use a **monorepo structure** with separate packages under `packages/`, unified by shared documentation and tooling at the root level.

```
baseAgent/
├── packages/
│   ├── core/       # Agent loop, state management
│   ├── gateway/    # Channel adapters, message routing
│   ├── memory/     # Memory loading, compaction, SQLite
│   ├── tools/      # Built-in tool implementations
│   └── dashboard/  # Web admin UI (v1.1+)
├── skills/         # User-installed extensions
├── workspace/      # Agent memory files
└── docs/           # Unified documentation
```

### Consequences

**Positive:**
- Shared types and interfaces between packages (e.g., tool schemas used by both core and tools)
- Atomic commits across subsystems (e.g., adding a new tool + loop support in one commit)
- Single CI/CD pipeline with selective builds
- AI-friendly — full system context in one repo

**Negative:**
- Need workspace-aware tooling (pnpm workspaces)
- Larger clone size as project grows
- Build complexity for selective package builds

**Risks:**
- Build times may increase — mitigated by incremental builds and caching

### Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| Polyrepo | Independent versioning, granular permissions | Coordination overhead, duplicate tooling, version drift | Too much overhead for a single-developer project |
| Single package | Simplest setup | No separation of concerns, harder to scale | Doesn't scale; mixes loop/gateway/tools concerns |

---

## ADR-002: Inherit vibeSeed Methodology

**Status**: Accepted
**Date**: 2026-02-18
**Deciders**: David Balzan

### Context

baseAgent needs a structured development workflow with documentation-driven planning, task tracking, and persistent knowledge capture. The vibeSeed methodology already provides this via Claude Code skills, Cursor commands, and VS Code prompts.

### Decision

Inherit the **vibeSeed** repository as the foundation for baseAgent. Keep all methodology files (skills, knowledge, commands, templates) and layer project-specific identity on top.

### Consequences

**Positive:**
- Immediate access to 11 AI workflow skills (`/start-session`, `/remember`, `/plan-phase`, etc.)
- Cross-IDE support (Claude Code, Cursor, VS Code Copilot) from day one
- Persistent knowledge capture across projects via `~/.claude/knowledge/`
- Phase-based planning with templates already available
- Full git history preserved for methodology evolution

**Negative:**
- Carries some files from vibeSeed that may not be relevant (e.g., `.cursorrules` examples from other projects)
- Knowledge files contain learnings from unrelated projects (LinkRecap, Godot)

**Risks:**
- Methodology files may drift from upstream vibeSeed — mitigated by periodic sync

### Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| Start from scratch | Clean slate, no baggage | Lose all methodology tooling, rebuild from zero | Massive duplication of effort |
| Fork vibeSeed | Independent evolution | Lose upstream improvements | Fork drift; prefer direct inheritance |
| Git submodule | Clean separation | Complex workflows, confusing for AI assistants | Adds indirection without benefit |

---

## ADR-003: Use SQLite for All Persistence

**Status**: Accepted
**Date**: 2026-02-18
**Deciders**: Project architecture

### Context

baseAgent needs to persist session state, traces, tool execution logs, cost tracking, and potentially embeddings. The system is designed for single-user, self-hosted deployment.

### Decision

Use **SQLite** as the sole structured data store. A single `agent.db` file handles sessions, traces, loop state (for resumability), and embeddings cache.

### Consequences

**Positive:**
- Zero external dependencies — no database server to install or manage
- Single-file database — trivial to backup, migrate, or inspect
- WAL mode supports concurrent reads during agent operation
- Excellent tooling (DB Browser for SQLite, Drizzle ORM, better-sqlite3)
- Sufficient performance for single-user workload

**Negative:**
- Limited concurrent write throughput (acceptable for single-user)
- No built-in replication or clustering
- Vector search requires extension (sqlite-vec) or external store

**Risks:**
- May need upgrade path to PostgreSQL for multi-user mode — mitigated by using an ORM (Drizzle) that supports both

### Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| PostgreSQL | Full-featured, vector support (pgvector), scales | Requires running a server, more setup | Overkill for single-user v1; upgrade path exists |
| File-based JSON | Simplest possible | No queries, no indexing, corruption risk | Too primitive for traces and session management |
| Redis | Fast, pub/sub support | In-memory only (or persistence adds complexity), another service | Not suitable as primary store; potential future addition for pub/sub |

---

## Best Practices for ADRs

### When to Write an ADR

- Choosing between technologies or frameworks
- Defining architectural patterns (monorepo, microservices, etc.)
- Making security or compliance decisions
- Any decision you'd need to explain to a new team member

### When NOT to Write an ADR

- Implementation details that are easily changed
- Style preferences (use linting rules instead)
- Temporary workarounds (use code comments)

### Keep ADRs Immutable

Once accepted, don't modify an ADR. If a decision changes:
1. Mark the old ADR as "Superseded by ADR-XXX"
2. Create a new ADR explaining the change
3. Reference the old ADR for context

This preserves the historical record of how decisions evolved.
