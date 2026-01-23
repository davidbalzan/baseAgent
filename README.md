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

# 4. Add knowledge reference to global CLAUDE.md
cat >> ~/.claude/CLAUDE.md << 'EOF'

## Knowledge Base

For domain-specific patterns, see `~/.claude/knowledge/`:
- Use `/remember <learning>` to capture new patterns
- Use `/distill` to convert learnings into formal ADRs
EOF
```

---

## Skills

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
| devops | Docker, CI/CD, pnpm, Scalar |
| process | Git, phases, ADRs, workflow |
| general | Anything else |

**Where it saves:**
- Local: `~/.claude/knowledge/<category>.md`
- Synced: `~/workspace/vibeSeed/.claude/knowledge/` → GitHub

---

### `/distill` - Formalize to ADR

Convert accumulated learnings into formal Architectural Decision Records for the current project.

**Usage:**
```bash
# Browse all categories
/distill

# List learnings from a category
/distill typescript

# Distill specific learning
/distill Use Hono for TypeScript-first APIs
```

**Flow:**
1. Shows learnings from knowledge base
2. You pick one to formalize
3. AI asks for context, alternatives, consequences
4. Generates ADR and appends to `docs/DECISIONS.md`

**ADR Format:**
```markdown
### ADR-001: Use Hono for TypeScript-First APIs

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
[What else was evaluated]
```

---

## Workflow

```
Experience → /remember → Learning → /distill → ADR
   ↓              ↓           ↓           ↓
 Coding    Quick capture   Pattern    Formal
 session   (seconds)       emerges    decision
```

**When to use each:**
- `/remember` - In the moment, when you learn something useful
- `/distill` - When a pattern is proven and should be documented for the team

---

## Knowledge Structure

```
~/.claude/
├── CLAUDE.md                    # Global preferences
├── skills/
│   ├── remember/SKILL.md        # /remember skill
│   └── distill/SKILL.md         # /distill skill
└── knowledge/
    ├── README.md                # Category index
    ├── typescript.md            # TypeScript learnings
    ├── react.md                 # React learnings
    ├── architecture.md          # Architecture learnings
    └── ...                      # Other categories
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
