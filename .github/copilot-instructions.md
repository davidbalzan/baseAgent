# Vibe Coding Project - Copilot Instructions

This project uses **Vibe Coding** - a documentation-driven approach for building software with AI assistance.

## Project Structure

```
project-root/
├── docs/
│   ├── PRODUCTION_ROADMAP.md  ← Single source of truth (Current Focus at top)
│   ├── DECISIONS.md           ← Architectural Decision Records
│   ├── TECH_STACK.md          ← Technology choices
│   ├── ARCHITECTURE_GUIDE.md  ← System design rationale
│   └── phases/                ← Phase-based task planning
├── client/                    ← Frontend (React + Vite)
├── server/                    ← Backend (Node.js + Hono)
└── CURRENT_FOCUS.md          ← Quick session context
```

## Key Documents to Read First

1. **CURRENT_FOCUS.md** - What's actively being worked on
2. **docs/PRODUCTION_ROADMAP.md** - Overall project status
3. **docs/phases/phaseN/PHASEN_TASKS.md** - Detailed task breakdowns

## Status Indicators

- ✅ Complete
- 🚧 In Progress  
- ⏳ Not Started
- 🔴 Critical Priority
- 🟡 Medium Priority
- 🟢 Low Priority

## Task Checkbox Format

```markdown
- [ ] Uncompleted task
- [x] Completed task
```

## When Working on Tasks

1. Check CURRENT_FOCUS.md for active work
2. Find the task in the relevant phase TASKS file
3. Update checkboxes as you complete sub-tasks
4. Update progress metrics when tasks complete

## Coding Preferences

- Clean architectures, modular approach
- Tailwind CSS for styling
- Latest stable versions of dependencies
- Avoid unnecessary code duplication
- Maintain consistency across the codebase
