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
| ADR-004 | [TypeScript + pnpm Workspaces](#adr-004-typescript--pnpm-workspaces) | Accepted | 2026-02-18 |
| ADR-005 | [Vercel AI SDK v6 for LLM Abstraction](#adr-005-vercel-ai-sdk-v6-for-llm-abstraction) | Accepted | 2026-02-18 |
| ADR-006 | [Hono for HTTP Layer](#adr-006-hono-for-http-layer) | Accepted | 2026-02-18 |
| ADR-007 | [Zod for All Validation and Schemas](#adr-007-zod-for-all-validation-and-schemas) | Accepted | 2026-02-18 |
| ADR-008 | [Plugin Dashboard Extension System](#adr-008-plugin-dashboard-extension-system) | Accepted | 2026-02-20 |

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

## ADR-004: TypeScript + pnpm Workspaces

**Status**: Accepted
**Date**: 2026-02-18
**Deciders**: David Balzan

### Context

baseAgent needs a language and package manager choice. The entire existing toolchain — Hono, Drizzle, BullMQ, Zod, Vercel AI SDK — is TypeScript-native. We need to formalize this and choose a workspace-aware package manager for the monorepo.

### Decision

Use **TypeScript** on **Node.js 22+** as the sole language, and **pnpm workspaces** for monorepo package management.

- TypeScript strict mode enabled across all packages
- Shared `tsconfig.json` base at repo root, extended per package
- pnpm for strict dependency hoisting and better disk usage
- Node.js 22 LTS for stable ES module support and built-in test runner

### Consequences

**Positive:**
- Full type safety across package boundaries (shared interfaces between core, gateway, tools)
- All chosen libraries are TypeScript-first — no `@types/*` wrappers needed
- pnpm strict mode prevents phantom dependencies
- Faster installs and reduced disk usage vs npm/yarn

**Negative:**
- Build step required (tsc or bundler) before execution
- pnpm less widely known than npm (minor learning curve)

**Risks:**
- Node.js 22 is current LTS — mitigated by `.nvmrc` pinning

### Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| JavaScript (no TS) | No build step | No type safety, worse DX with Zod/Drizzle | Loses too much; all deps are TS-native |
| npm workspaces | Most widely used | Slower installs, less strict hoisting | pnpm better for monorepos |
| yarn berry | Plug'n'Play, fast | Complex setup, PnP compatibility issues | pnpm simpler with better strictness |
| Bun | Fast runtime + bundler | Less mature, some Node.js API gaps | Risk for production; can revisit later |

---

## ADR-005: Vercel AI SDK v6 for LLM Abstraction

**Status**: Accepted
**Date**: 2026-02-18
**Deciders**: David Balzan

### Context

baseAgent must support multiple LLM providers (Anthropic, OpenAI, local models) with the ability to switch via configuration. During development, OpenRouter provides access to 300+ models with a single API key. Production will use direct provider APIs. We need a unified interface that avoids vendor lock-in while keeping the codebase simple.

### Decision

Use **Vercel AI SDK v6** (`ai` package) as the unified LLM interface. The SDK provides a single `LanguageModel` type that all provider adapters conform to.

**Provider adapters (installed as needed):**
- `@openrouter/ai-sdk-provider` — dev/testing (300+ models, one key)
- `@ai-sdk/anthropic` — production Claude (Opus 4.6 / Sonnet 4.6)
- `@ai-sdk/openai` — production OpenAI
- `ollama-ai-provider` — local/offline models

**Own ReAct loop** — use the SDK's `streamText`/`generateText` primitives but build a custom agent loop for:
- Resumability (persist loop state to SQLite)
- Cost caps and iteration limits
- Streaming to the gateway layer
- Custom tool execution with sandboxing

### Consequences

**Positive:**
- Single `LanguageModel` type throughout codebase — swap providers via config, not code
- Provider switching is a one-line config change (model ID + adapter)
- Built-in tool calling support with Zod schema validation
- Active maintenance by Vercel, large community
- Streaming support out of the box

**Negative:**
- Dependency on Vercel's SDK release cycle
- Custom loop means we don't get the SDK's built-in `agent()` helper (intentional trade-off)

**Risks:**
- SDK breaking changes — mitigated by pinning versions and testing against CI
- OpenRouter rate limits during dev — mitigated by fallback to local Ollama

### Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| Raw OpenAI SDK + baseURL swap | Simple, minimal deps | Manual type mapping per provider, no unified tool calling | Too much glue code for multi-provider |
| LiteLLM proxy | 100+ providers, drop-in | Requires running a Python proxy server, adds infra | External process contradicts zero-dep philosophy |
| Custom abstraction | Full control | Significant effort to build and maintain | Vercel AI SDK already solves this well |
| LangChain.js | Feature-rich, many integrations | Heavy, opinionated, abstracts too much | Over-engineered for our use case; we want control over the loop |

---

## ADR-006: Hono for HTTP Layer

**Status**: Accepted
**Date**: 2026-02-18
**Deciders**: David Balzan

### Context

baseAgent needs an HTTP server for webhook receivers (platform event triggers), health endpoints (monitoring), and a future admin API (dashboard). The server is not the primary interface — messaging channels are — so it should be minimal and fast.

### Decision

Use **Hono** as the HTTP framework for all server-side endpoints.

- Webhook receiver for external event triggers (e.g., GitHub, calendar)
- Health endpoint (`/health`) for monitoring and liveness probes
- Future admin API for dashboard UI
- Zod integration via `@hono/zod-validator` for request validation
- ~14KB, zero dependencies, Web Standard APIs (Request/Response)

### Consequences

**Positive:**
- Ultralight (~14KB) — negligible impact on bundle size
- Web Standard APIs — portable across Node.js, Deno, Bun, Cloudflare Workers
- Built-in middleware ecosystem (CORS, auth, logging)
- TypeScript-first with excellent type inference for routes
- Already in the project toolchain (no new dependency)

**Negative:**
- Smaller ecosystem than Express (fewer third-party middleware)
- Less community knowledge compared to Express/Fastify

**Risks:**
- Middleware gaps — mitigated by Hono's growing ecosystem and ability to write custom middleware

### Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| Express | Massive ecosystem, universal knowledge | Heavy, callback-based, dated TypeScript support | Outdated DX; Hono is lighter and more modern |
| Fastify | Fast, schema validation, plugins | Heavier than Hono, Node.js-only | More than we need; Hono sufficient |
| tRPC | End-to-end type safety | Requires client coupling, not suitable for webhooks | Webhooks need standard HTTP endpoints |
| No HTTP server | Simplest | Can't receive webhooks, no health endpoint | Need at minimum health check and webhook receiver |

---

## ADR-007: Zod for All Validation and Schemas

**Status**: Accepted
**Date**: 2026-02-18
**Deciders**: David Balzan

### Context

baseAgent has validation needs at every layer: tool parameter schemas, config parsing, API request/response validation, LLM structured output, and message payloads between packages. We need a single schema library used consistently throughout the codebase so that types, validation, and documentation stay in sync.

### Decision

Use **Zod** as the sole schema definition and validation library across all packages. Every data boundary in the system uses Zod schemas as the source of truth.

**Where Zod is used:**
- **Tool definitions** — each tool declares its parameters as a Zod schema; the agent loop validates inputs before execution
- **LLM structured output** — Vercel AI SDK's `generateObject`/`streamObject` accept Zod schemas directly for type-safe model responses
- **Config parsing** — `config/default.yaml` is validated at startup against a Zod schema, failing fast on invalid config
- **API validation** — Hono routes use `@hono/zod-validator` middleware for request body/query/param validation
- **Inter-package contracts** — shared types between `@baseagent/core`, `gateway`, `tools`, etc. are defined as Zod schemas and inferred with `z.infer<>`
- **Message payloads** — channel adapter messages validated at the gateway boundary

**Key pattern:** Define the Zod schema first, then derive the TypeScript type from it — never the other way around.

```typescript
// Correct: schema is source of truth
const ToolResultSchema = z.object({
  toolName: z.string(),
  output: z.unknown(),
  durationMs: z.number(),
});
type ToolResult = z.infer<typeof ToolResultSchema>;

// Wrong: don't define interface first then build schema to match
```

### Consequences

**Positive:**
- Single source of truth for types and validation — no drift between runtime checks and TypeScript types
- Native integration with Vercel AI SDK (tool schemas, structured output)
- Native integration with Hono (`@hono/zod-validator`)
- Excellent error messages for debugging invalid data
- Schemas are serializable — can generate JSON Schema for external docs

**Negative:**
- Runtime overhead for validation (negligible for our scale)
- Learning curve for complex schema compositions (transforms, refinements)

**Risks:**
- Schema duplication across packages — mitigated by exporting shared schemas from `@baseagent/core`

### Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| TypeScript types only | Zero runtime cost | No runtime validation, types erased at runtime | Can't validate LLM output, config, or API inputs at runtime |
| Joi | Mature, widely used | No TypeScript type inference, heavier | Zod's type inference is a major advantage |
| Yup | Similar to Joi | Weaker TS inference, less active | Zod has better ecosystem fit (AI SDK, Hono) |
| ArkType | Faster validation | Less mature, smaller ecosystem | Too new; Zod is the ecosystem standard for our stack |
| io-ts | Strong FP approach | Steep learning curve, verbose | Over-engineered for our needs |

---

## ADR-008: Plugin Dashboard Extension System

**Status**: Accepted
**Date**: 2026-02-20
**Deciders**: David Balzan

### Context

The dashboard at `GET /dashboard` is a single-page HTML app serving built-in tabs (Traces, Live, Memory, Costs). The scheduler plugin (`@baseagent/plugin-scheduler`) needed a "Tasks" tab to display scheduled tasks, but hardcoding it in the dashboard HTML created a coupling problem: the Tasks tab was always visible even when the scheduler plugin wasn't loaded, and other plugins had no way to contribute their own UI.

### Decision

Add a **`DashboardTab`** type to `@baseagent/core` and a `dashboardTabs` field to `PluginCapabilities`, enabling any plugin to register dashboard tabs at init time. The server injects plugin tabs into the dashboard HTML at serve-time via template placeholders.

**How it works:**

1. Plugin returns `dashboardTabs: DashboardTab[]` from `init()` — each tab declares its `id`, `label`, `panelHtml`, optional `css`, `js`, and `onActivate` expression
2. The plugin loader collects all tabs into `PluginLoadResult.dashboardTabs`
3. At server startup, `injectPluginTabs()` replaces five placeholders in the dashboard HTML template:
   - `<!-- __PLUGIN_TAB_BUTTONS__ -->` — nav buttons
   - `<!-- __PLUGIN_PANELS__ -->` — panel HTML
   - `/* __PLUGIN_CSS__ */` — scoped styles + show/hide rules
   - `// __PLUGIN_JS__` — state and functions
   - `// __PLUGIN_KEYBOARD_SHORTCUTS__` — keyboard shortcuts (keys 5-9)
4. Plugin panels are hidden by default; auto-generated CSS rules (`.layout.tab-{id} .{id}-panel { display: flex }`) handle tab switching
5. Lazy loading via `onActivate` — the expression runs once on first tab activation

**Convention:** Plugin `panelHtml` root element must use the CSS class `{id}-panel` (e.g. `tasks-panel`) for the auto-generated show/hide rules to work.

**Plugin routes:** Plugins can also provide their own API endpoints via `routes` (a Hono sub-app) and `routePrefix`. The scheduler plugin serves `GET /scheduler/tasks` for its dashboard tab's data needs.

### Consequences

**Positive:**
- Dashboard is fully decoupled from plugins — no Tasks tab when scheduler isn't loaded
- Any plugin can contribute dashboard UI with zero changes to the server
- Plugin tabs are self-contained (HTML + CSS + JS in one `DashboardTab` object)
- No build tooling required — raw HTML/CSS/JS strings, no bundler
- Keyboard shortcuts auto-assigned (keys 5-9) for plugin tabs

**Negative:**
- Plugin UI is limited to what can be expressed as raw HTML/CSS/JS strings (no component framework)
- Maximum 5 plugin tabs with keyboard shortcuts (keys 5-9); additional tabs work but lack shortcuts
- No client-side isolation between plugin scripts (shared global scope)

**Risks:**
- Plugin JS name collisions — mitigated by convention (prefix globals with plugin name)
- Large plugin CSS/JS may slow initial page load — mitigated by lazy `onActivate` loading

### Alternatives Considered

| Alternative | Pros | Cons | Why Not |
|-------------|------|------|---------|
| Conditional hardcoded tab | Simple — one `if` check per tab | Every new plugin requires dashboard changes; hardcoded coupling | Doesn't scale; violates plugin independence |
| Separate plugin page at `/scheduler` | Full isolation, no injection needed | Loses dashboard integration (tabs, nav, shared styles) | Fragmented UX; users want a single dashboard |
| iframe-based plugin panels | Full script isolation per plugin | Complex communication, inconsistent styling, performance | Over-engineered; current plugins are trusted |

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
