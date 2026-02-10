# Architecture Learnings

Accumulated knowledge about system design and structure from project experience.

## Entries

- [2026-01-23] Use feature-based organization - co-locate UI, state, routes, services, and types per feature
- [2026-01-23] Monorepo with client/server/docs - unified tooling, atomic commits, shared types
- [2026-01-23] Phase-based development breaks overwhelming projects into digestible sprints with checkboxes
- [2026-01-23] Keep CURRENT_FOCUS.md updated for AI session handoffs - phase, task, branch, blockers
- [2026-02-10] Feature flags should only hide the upgrade *path*, never downgrade existing users. For ENABLE_TEAM_TIER: guard new-subscription endpoints (upgrade-to-team, seats/checkout) but never guard read/manage endpoints (GET/PUT seats, seats/portal). In UI, always show team management for users whose tier is 'team' or 'founder' regardless of flag state. Team users retain all features (create/join teams, shared links, notes, analytics, seat management).
