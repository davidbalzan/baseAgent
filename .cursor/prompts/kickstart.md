# Kickstart - Project Initialization Wizard

Initialize a new project with the complete vibe coding documentation structure. This prompt guides you through setting up all foundational documents for a well-organized, AI-friendly project.

## Instructions

Follow this guided flow to set up a new project from scratch.

### Stage 1: Project Setup

First, gather basic information:

1. **Project name** - What's the project called?
2. **Project type** - Web app, API, CLI, library, mobile, etc.
3. **Brief description** - One sentence about what it does

Then create the folder structure:

```
project-root/
├── docs/
│   ├── phases/
│   │   └── templates/
│   └── templates/
├── client/src/          # If frontend needed
└── server/src/          # If backend needed
```

### Stage 2: Tech Stack Discovery

Ask about each layer (skip if not applicable):

**Frontend:**
- Framework? (React, Vue, Svelte, etc.)
- Build tool? (Vite, Next.js, etc.)
- Styling? (Tailwind, CSS-in-JS, etc.)
- State management? (Zustand, Redux, etc.)

**Backend:**
- Runtime? (Node.js, Deno, Bun, Python, Go, etc.)
- Framework? (Hono, Express, FastAPI, etc.)
- Database? (PostgreSQL, MySQL, MongoDB, etc.)
- ORM? (Drizzle, Prisma, SQLAlchemy, etc.)

**Infrastructure:**
- Package manager? (pnpm, npm, yarn)
- Monorepo? (Yes/No)
- Deployment target? (Vercel, AWS, Docker, etc.)

Generate `docs/TECH_STACK.md` with the collected information.

### Stage 3: Architecture Decisions

For each major technology choice, ask:
1. **Why this choice?** - Rationale for the decision
2. **What alternatives were considered?** - Other options evaluated
3. **What are the trade-offs?** - Pros and cons

Generate:
- `docs/ARCHITECTURE_GUIDE.md` - Overview and patterns
- `docs/DECISIONS.md` - Initial ADRs for key choices

### Stage 4: Project Phases

Ask about the project scope:
1. **What's the MVP?** - Minimum viable product scope
2. **What comes after MVP?** - Future phases
3. **Any hard deadlines?** - Timeline constraints

Suggest a phase structure based on project type:

**Typical Web App Phases:**
```
Phase 1: Foundation (Setup, Auth, Core UI)
Phase 2: Core Features (Main functionality)
Phase 3: Polish (UX, Performance, Testing)
Phase 4: Launch (Deployment, Monitoring)
```

**Typical API Phases:**
```
Phase 1: Foundation (Setup, Database, Core Endpoints)
Phase 2: Security (Auth, Rate Limiting, Validation)
Phase 3: Features (Business Logic, Integrations)
Phase 4: Production (Monitoring, Docs, Deployment)
```

Generate:
- `docs/PRODUCTION_ROADMAP.md` - High-level roadmap
- `docs/phases/README.md` - Phase overview
- `docs/phases/phase1/README.md` - First phase outline

### Stage 5: Initialize Focus

Set up the current focus document:
- Point to Phase 1 as the starting point
- Note any immediate next steps
- Leave session notes empty for first session

Generate `CURRENT_FOCUS.md` at project root.

### Stage 6: Design System (Optional)

If the project has a frontend, ask:
1. **Color scheme?** - Primary, secondary, accent colors
2. **Typography?** - Font family preferences
3. **Component style?** - Minimal, modern, playful, corporate

Generate `docs/DESIGN_SYSTEM.md` if applicable.

### Stage 7: Summary & Next Steps

Provide a summary of everything created:

```markdown
## Project Initialized: [Project Name]

### Files Created
- docs/TECH_STACK.md
- docs/ARCHITECTURE_GUIDE.md
- docs/DECISIONS.md
- docs/PRODUCTION_ROADMAP.md
- docs/DESIGN_SYSTEM.md (if frontend)
- docs/phases/README.md
- docs/phases/phase1/README.md
- docs/phases/templates/TASK_TEMPLATE.md
- docs/templates/PRD_TEMPLATE.md
- CURRENT_FOCUS.md

### Next Steps
1. Use `@create-prd.md` to define detailed requirements
2. Use `@plan-phase.md` to create Phase 1 detailed tasks
3. Use `@start-session.md` to begin development
```

## Output Files

| File | Purpose |
|------|---------|
| `docs/TECH_STACK.md` | Technology choices and versions |
| `docs/ARCHITECTURE_GUIDE.md` | System design and patterns |
| `docs/DECISIONS.md` | Architectural Decision Records |
| `docs/PRODUCTION_ROADMAP.md` | High-level phase overview |
| `docs/DESIGN_SYSTEM.md` | Visual design guidelines (optional) |
| `docs/phases/README.md` | Phase navigation and progress |
| `docs/phases/phase1/README.md` | First phase overview |
| `docs/phases/templates/*` | Reusable planning templates |
| `docs/templates/PRD_TEMPLATE.md` | PRD template |
| `CURRENT_FOCUS.md` | Active work quick reference |

## Tips

- **Start lean**: You can always add more detail later
- **Capture decisions early**: Future you will thank you
- **Don't overthink phases**: They can be adjusted as you learn
- **Link documents**: Cross-reference between docs for navigation

## Related Prompts

After kickstart, use these in order:
1. `@create-prd.md` - Define detailed product requirements
2. `@plan-phase.md` - Create Phase 1 task breakdown
3. `@start-session.md` - Begin your first coding session
4. `@log-decision.md` - Record decisions as you make them
