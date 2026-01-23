# Vibe Seed

> A documentation-driven project template for building software with AI assistance.

---

## 🤖 AI Agent Quick Start

**What is this?** A reusable template/seed for bootstrapping new projects with structured documentation that enables effective AI pair programming.

**Start here:**
1. [`VIBE_CODING_SEED.md`](./VIBE_CODING_SEED.md) — The complete methodology guide
2. [`docs/COMMANDS.md`](./docs/COMMANDS.md) — AI assistant commands for all IDEs
3. [`CURRENT_FOCUS.md`](./CURRENT_FOCUS.md) — What's actively being worked on
4. [`docs/DECISIONS.md`](./docs/DECISIONS.md) — Architectural decision records

---

## 📁 Repository Structure

```
vibe_seed/
├── README.md                 ← You are here
├── VIBE_CODING_SEED.md       ← Core methodology & document templates
├── CURRENT_FOCUS.md          ← Active work context (session handoffs)
│
├── docs/
│   ├── COMMANDS.md           ← AI assistant commands guide
│   ├── DECISIONS.md          ← ADR (Architectural Decision Records)
│   ├── phases/
│   │   └── templates/        ← Reusable planning templates
│   └── templates/
│       └── PRD_TEMPLATE.md   ← Product requirements template
│
├── .claude/skills/           ← Claude Code slash commands
├── .cursor/commands/         ← Cursor slash commands
└── .vscode/prompts/          ← VS Code Copilot prompts
```

---

## 🚀 Using This Template

### For a New Project

1. Copy this repo structure to your new project
2. Customize `VIBE_CODING_SEED.md` for your domain
3. Create your phases in `docs/phases/phase1/`, `phase2/`, etc.
4. Update `CURRENT_FOCUS.md` as you work
5. Log major decisions in `docs/DECISIONS.md`

### Key Principles

- **Documentation as Code** — Plans are living documents with checkboxes
- **Phase-Based Development** — Break work into digestible phases
- **AI-Friendly Structure** — Clear hierarchy for context persistence
- **Rollback Planning** — Every risky task has a contingency

### New Machine Setup

When setting up on a new machine, run these commands to get your global Claude Code configuration:

```bash
# 1. Clone vibeSeed
git clone git@github.com:davidbalzan/vibeSeed.git ~/workspace/vibeSeed

# 2. Create global Claude directories
mkdir -p ~/.claude/skills ~/.claude/knowledge

# 3. Copy skills (including /remember)
cp -r ~/workspace/vibeSeed/.claude/skills/* ~/.claude/skills/

# 4. Copy knowledge base
cp -r ~/workspace/vibeSeed/.claude/knowledge/* ~/.claude/knowledge/

# 5. Create/update global CLAUDE.md
cat >> ~/.claude/CLAUDE.md << 'EOF'

## Knowledge Base

For domain-specific patterns and learnings, see `~/.claude/knowledge/`:
- Reference `~/.claude/knowledge/README.md` for category index
- Use `/remember <category>: <learning>` to add new entries
EOF
```

This gives you:
- `/remember` skill for capturing learnings
- All accumulated knowledge from previous machines
- Consistent development environment across machines

---

## 📋 Document Types

| Document | Purpose | Update Frequency |
|----------|---------|------------------|
| `CURRENT_FOCUS.md` | Session context | Every work session |
| `PHASEN_TASKS.md` | Detailed task tracking | As tasks complete |
| `DECISIONS.md` | Why we chose X over Y | When decisions are made |
| `ARCHITECTURE_GUIDE.md` | System design rationale | When architecture evolves |

---

## 🔗 Quick Links

- [Full Methodology Guide](./VIBE_CODING_SEED.md)
- [AI Commands Guide](./docs/COMMANDS.md) — How to use `/kickstart`, `/create-prd`, etc.
- [PRD Template](./docs/templates/PRD_TEMPLATE.md)
- [Task Template](./docs/phases/templates/TASK_TEMPLATE.md)

---

**License**: Use freely. Adapt for your needs. 🚀
