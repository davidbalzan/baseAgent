# Vibe Seed

> Documentation-driven development with persistent knowledge capture across projects.

---

## Quick Start

### New Machine Setup

```bash
# 1. Clone vibeSeed
git clone git@github.com:davidbalzan/vibeSeed.git ~/workspace/vibeSeed

# 2. Create global Claude directories
mkdir -p ~/.claude/skills ~/.claude/knowledge

# 3. Copy skills and knowledge
cp -r ~/workspace/vibeSeed/.claude/skills/* ~/.claude/skills/
cp -r ~/workspace/vibeSeed/.claude/knowledge/* ~/.claude/knowledge/

# 4. Add to global CLAUDE.md
cat >> ~/.claude/CLAUDE.md << 'EOF'

## Knowledge Base

For domain-specific patterns, see `~/.claude/knowledge/`:
- Use `/remember <learning>` to capture new patterns
- Use `/distill` to convert learnings into formal ADRs

## Architectural Context

Always check `docs/DECISIONS.md` for architectural decisions before:
- Proposing technology changes
- Designing new features
- Making infrastructure choices

Use `/start-session` to load project context including recent ADRs.
EOF
```

---

## Skills

### `/start-session` - Load Project Context

Start each coding session by loading context from vibe coding docs. Reads current phase, tasks, and **consults ADRs** for architectural decisions.

**Usage:**
```bash
# Load full context
/start-session

# Focus on specific area
/start-session authentication
```

**What it reads:**
1. `docs/PRODUCTION_ROADMAP.md` - Current focus section
2. `docs/phases/phaseN/README.md` - Active phase overview
3. `docs/phases/phaseN/PHASEN_TASKS.md` - Task breakdown
4. `docs/DECISIONS.md` - Recent and relevant ADRs

**Output:**
```
## Session Context

**Active Phase**: Phase 2 - Authentication
**Current Task**: JWT Middleware
**Status**: In Progress

### Recent Decisions
- ADR-006: Scalar for API docs
- ADR-007: BullMQ for background jobs

### Suggested Next Steps
1. Complete JWT validation
2. Add refresh token logic
```

---

### `/remember` - Capture Learnings

Quickly capture patterns and preferences as you work. Knowledge persists globally across all projects.

**Usage:**
```bash
# With explicit category
/remember typescript: Always use Zod for runtime validation

# Auto-categorized (AI detects category from content)
/remember Always use Zod for runtime validation
```

**Categories:**
| Category | Topics |
|----------|--------|
| typescript | Types, Zod, generics, Hono, Drizzle |
| react | Components, hooks, Zustand, Vite |
| tailwind | Styling, utilities, responsive |
| testing | Jest, Vitest, coverage, mocks |
| architecture | Monorepo, feature-based, patterns |
| database | SQL, PostgreSQL, migrations, indexes |
| ai | LLMs, prompts, providers |
| devops | Docker, CI/CD, pnpm, Scalar, BullMQ |
| process | Git, phases, ADRs, workflow |
| general | Anything else |

**Where it saves:**
- Local: `~/.claude/knowledge/<category>.md`
- Synced: `~/workspace/vibeSeed/.claude/knowledge/` → GitHub

---

### `/distill` - Formalize to ADR (Use Sparingly)

Convert learnings into formal ADRs. **Most learnings don't need this** - the one-liner is enough.

**Only distill when:**
- Team needs the "why" (onboarding, stakeholders)
- Significant trade-offs worth documenting
- Decision might be challenged later

**Usage:**
```bash
# Browse all categories
/distill

# List learnings from a category
/distill typescript

# Distill specific learning (or "all" for batch)
/distill Use Hono for TypeScript-first APIs
```

**Flow:**
1. Shows learnings from knowledge base
2. You pick one (or "all") to formalize
3. AI gathers context, alternatives, consequences
4. Generates ADR and appends to `docs/DECISIONS.md`

**ADR Format:**
```markdown
### ADR-006: Use Scalar for API Documentation

**Date**: 2026-01-23
**Status**: Accepted
**Source**: Distilled from learning

#### Context
[Why this became a pattern]

#### Decision
[The formalized decision]

#### Consequences
**Positive:** [Benefits]
**Negative:** [Trade-offs]

#### Alternatives Considered
| Alternative | Pros | Cons | Why Not |
```

---

## Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    KNOWLEDGE LIFECYCLE                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   /start-session                                             │
│        ↓                                                     │
│   ┌─────────┐     ┌──────────┐     ┌─────────┐              │
│   │  ADRs   │ ←── │ /distill │ ←── │Learning │              │
│   │consulted│     │ formalize│     │ emerges │              │
│   └────┬────┘     └──────────┘     └────┬────┘              │
│        │                                 │                   │
│        ↓                                 │                   │
│   ┌─────────┐                      ┌─────────┐              │
│   │ Coding  │ ──────────────────→  │/remember│              │
│   │ session │     experience       │ capture │              │
│   └─────────┘                      └─────────┘              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**When to use each:**
| Skill | When | Frequency |
|-------|------|-----------|
| `/start-session` | Beginning of work session | Every session |
| `/remember` | Learn something useful | Often (default) |
| `/distill` | Team needs formal justification | Rarely |

---

## Knowledge Structure

```
~/.claude/
├── CLAUDE.md                    # Global preferences + ADR reference
├── skills/
│   ├── start-session/SKILL.md   # /start-session - context loader
│   ├── remember/SKILL.md        # /remember - quick capture
│   └── distill/SKILL.md         # /distill - formalize to ADR
└── knowledge/
    ├── README.md                # Category index
    ├── typescript.md
    ├── react.md
    ├── architecture.md
    ├── devops.md
    ├── process.md
    └── ...
```

**Project structure:**
```
your-project/
└── docs/
    ├── DECISIONS.md             # ADRs (consulted by /start-session)
    ├── PRODUCTION_ROADMAP.md    # Current focus
    └── phases/                  # Task breakdowns
```

---

## Other Resources

| Document | Purpose |
|----------|---------|
| [VIBE_CODING_SEED.md](./VIBE_CODING_SEED.md) | Full methodology guide |
| [docs/COMMANDS.md](./docs/COMMANDS.md) | All AI commands for IDEs |
| [CURRENT_FOCUS.md](./CURRENT_FOCUS.md) | Active work context |

---

## Syncing Knowledge

Knowledge auto-syncs to this repo when using `/remember`. To manually sync:

```bash
# Push local knowledge to vibeSeed
cp -r ~/.claude/knowledge/* ~/workspace/vibeSeed/.claude/knowledge/
cd ~/workspace/vibeSeed
git add .claude/knowledge
git commit -m "knowledge: Update from $(hostname)"
git push

# Pull latest knowledge to local
cd ~/workspace/vibeSeed && git pull
cp -r .claude/knowledge/* ~/.claude/knowledge/
```

---

**License**: Use freely. Adapt for your needs.
