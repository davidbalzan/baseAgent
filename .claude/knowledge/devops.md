# DevOps Learnings

Accumulated knowledge about deployment, infrastructure, and tooling from project experience.

## Entries

- [2026-01-23] Use Scalar for documenting REST APIs
- [2026-01-23] Use BullMQ when system needs non-trivial background job processing
- [2026-01-23] Use pnpm workspaces for monorepo - better disk usage, stricter dependencies
- [2026-02-10] Android mobile release process: Run `cd mobile && npx eas-cli build --platform android --profile production --auto-submit` (use `npx eas-cli`, not bare `eas` — not in PATH). The "production" build profile targets Play Store internal track as draft (configured in eas.json submit section). After submission, optionally run `python3 scripts/promote-release.py` to promote. Root package.json has `deploy:mobile:test` but it uses bare `eas` which fails. EAS channels configured per build profile in eas.json (production/internal → "production" channel). OTA updates are separate: `npx eas-cli update --platform android --channel production` pushes JS bundle changes without a full build.
