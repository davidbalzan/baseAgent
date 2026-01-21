# Architectural Decision Records (ADRs)

> **Document the "why" behind significant technical decisions.**

ADRs capture context that's easy to forget: why we chose X over Y, what constraints existed, and what trade-offs we accepted. Future team members (and AI assistants) will thank you.

---

## 📋 Decision Log

| ID | Decision | Status | Date |
|----|----------|--------|------|
| ADR-001 | [Example: Use Hono over Express](#adr-001-use-hono-over-express) | ✅ Accepted | 2026-01-12 |
| ADR-002 | [Use Monorepo Structure](#adr-002-use-monorepo-structure) | ✅ Accepted | 2026-01-21 |

---

## ADR Template

When adding a new decision, copy this template:

```markdown
## ADR-XXX: [Title]

**Status**: 🟡 Proposed | ✅ Accepted | ❌ Rejected | 🔄 Superseded by ADR-XXX  
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

## ADR-001: Use Hono over Express

**Status**: ✅ Accepted  
**Date**: 2026-01-12  
**Deciders**: Initial architecture team

### Context

We need a web framework for the backend API. The main candidates are Express (industry standard), Fastify (performance-focused), and Hono (modern, lightweight).

### Decision

Use **Hono** as our web framework.

### Consequences

**Positive:**
- First-class TypeScript support with type-safe routing
- Built-in OpenAPI/Swagger generation with `@hono/zod-openapi`
- Lightweight (~14kb) with excellent performance
- Works across runtimes (Node, Deno, Bun, Cloudflare Workers)
- Modern middleware patterns

**Negative:**
- Smaller ecosystem than Express
- Fewer tutorials and Stack Overflow answers
- Team may need to learn new patterns

**Risks:**
- Community support uncertainty → Mitigated by active development and growing adoption
- Missing middleware → Can use Express middleware via adapters

### Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| Express | Huge ecosystem, familiar | Dated patterns, callback-heavy, no native TS | Legacy patterns, middleware complexity |
| Fastify | Fast, good TS support | More complex plugin system | Heavier than needed, less OpenAPI integration |
| Koa | Clean middleware | Small ecosystem, less maintained | Not as actively developed |

---

## ADR-002: Use Monorepo Structure

**Status**: ✅ Accepted
**Date**: 2026-01-21
**Deciders**: Project architecture

### Context

When organizing a full-stack project with frontend (client) and backend (server) components, we need to decide between a monorepo (single repository) or polyrepo (multiple repositories) approach. This decision impacts developer experience, CI/CD, code sharing, and team collaboration.

### Decision

Use a **monorepo structure** with separate packages for client and server, unified by shared documentation and tooling at the root level.

```
project-root/
├── client/          # Frontend application
├── server/          # Backend application
├── proto/           # Shared protocol definitions (optional)
└── docs/            # Unified documentation
```

### Consequences

**Positive:**
- **Shared tooling** - Single ESLint, TypeScript, and Prettier config across packages
- **Atomic commits** - Frontend and backend changes in one commit, easier to track related changes
- **Simplified dependencies** - Shared types, protocols, and utilities between packages
- **Unified documentation** - One `docs/` folder covers the whole system
- **Easier refactoring** - Cross-package changes are easier to coordinate
- **Single source of truth** - Version control, issues, and PRs in one place
- **AI-friendly** - Easier for AI assistants to understand full system context

**Negative:**
- **Larger repository size** - Clone times increase as project grows
- **Complex CI/CD** - Need to detect which packages changed for selective builds
- **Permission granularity** - Can't restrict access to specific packages easily
- **Build complexity** - Need workspace-aware tooling (pnpm, npm workspaces, etc.)

**Risks:**
- Build times may increase → Mitigated by using incremental builds and caching
- Merge conflicts in shared files → Mitigated by clear ownership and modular structure

### Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| Polyrepo (separate repos) | Independent versioning, granular permissions, smaller clones | Harder to coordinate changes, duplicate tooling, version drift | Coordination overhead outweighs benefits for small-medium teams |
| Git submodules | Separate repos with linking | Complex workflows, confusing for contributors | Adds complexity without significant benefits |
| Monolith (single package) | Simplest setup | No separation of concerns, harder to scale | Doesn't scale, mixes frontend/backend concerns |

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
1. Mark the old ADR as "🔄 Superseded by ADR-XXX"
2. Create a new ADR explaining the change
3. Reference the old ADR for context

This preserves the historical record of how decisions evolved.
