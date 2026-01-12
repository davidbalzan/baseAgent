# Vibe Seed

> A documentation-driven project template for building software with AI assistance.

---

## 🤖 AI Agent Quick Start

**What is this?** A reusable template/seed for bootstrapping new projects with structured documentation that enables effective AI pair programming.

**Start here:**
1. [`VIBE_CODING_SEED.md`](./VIBE_CODING_SEED.md) — The complete methodology guide
2. [`CURRENT_FOCUS.md`](./CURRENT_FOCUS.md) — What's actively being worked on
3. [`docs/DECISIONS.md`](./docs/DECISIONS.md) — Architectural decision records

---

## 📁 Repository Structure

```
vibe_seed/
├── README.md                 ← You are here
├── VIBE_CODING_SEED.md       ← Core methodology & document templates
├── CURRENT_FOCUS.md          ← Active work context (session handoffs)
│
└── docs/
    ├── DECISIONS.md          ← ADR (Architectural Decision Records)
    └── phases/
        └── templates/        ← Reusable planning templates
            ├── TASK_TEMPLATE.md
            └── task_template_prompt.md
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
- [Task Template](./docs/phases/templates/TASK_TEMPLATE.md)
- [AI Planning Prompt](./docs/phases/templates/task_template_prompt.md)

---

**License**: Use freely. Adapt for your needs. 🚀
