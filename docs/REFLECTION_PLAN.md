# Reflection Implementation Plan

Status: In progress (Phase 1 complete, Phase 2 partial)
Owner: Agent runtime
Date: 2026-02-21

## Goal

Add first-class reflection to the runtime loop so the agent can self-check before and after actions, learn at session boundaries, and improve continuously while controlling token cost.

## Current State

- We already have iterative tool execution, governance checks, traces, and failure recovery nudges.
- We have retrospective self-improvement (`self_improve`) and periodic memory review via heartbeat.
- We do not yet have a dedicated runtime reflection stage (pre-action and post-action) as a first-class loop feature.

## Architectural Compliance Check

This plan and implementation stay aligned with existing ADRs:

- ADR-001/004 (monorepo + TypeScript): implemented inside existing packages with strict TS and workspace scripts.
- ADR-005 (Vercel AI SDK abstraction): no provider lock-in added; reflection uses existing loop abstractions.
- ADR-007 (Zod-first validation): reflection config is defined in config schema with defaults and typing.
- ADR-008/009 (plugin/runtime boundaries): reflection logic lives in core loop and server wiring, not hardcoded in channel adapters.
- Existing governance model is preserved; reflection supplements execution with checks and nudges, it does not bypass approvals.

## Target State

1. Pre-action reflection
   - Validate tool/action fit before execution.
   - Emit structured trace events for risk and decision rationale.

2. Post-action reflection
   - Evaluate tool result quality and detect mismatch patterns.
   - Emit structured trace events and produce targeted recovery nudges.

3. Session reflection
   - Summarize key wins/failures and candidate learnings at session end.

4. Continuous improvement
   - Run periodic reflection review and safe, bounded improvement actions.

## Cost-Aware Model Strategy

Default principle: deterministic checks first, cheap model second, capable model only when needed.

- Stage A (pre-check): deterministic, no model call.
- Stage B (post-check): deterministic first; cheap model optional for ambiguous cases.
- Stage C (session reflection): cheap model by default.
- Stage D (escalation): capable model only for high-risk cases:
  - repeated failures,
  - governance denials/timeouts on critical actions,
  - unresolved contradictions in tool observations,
  - high-impact code changes.

Guardrails:
- Reflection token budget cap: max 10-15% of session token budget.
- Max reflection nudges per iteration.
- Skip reflection for trivial one-turn sessions.

## Implementation Phases

### Phase 1 (now): Loop Reflection Scaffolding

- Add reflection config flags (enabled, max nudges).
- Add pre/post reflection trace phases.
- Add deterministic pre-action and post-action checks.
- Inject bounded, targeted nudges when high-signal failures are detected.

### Phase 2: Session-Level Reflection

- Emit `reflection_session` summary at session end.
- Persist high-signal learnings to per-user memory when enabled.

Implementation status:
- `reflection_session` trace emission implemented.
- Optional per-user USER.md persistence implemented behind `reflection.persistToUserMemory`.

### Phase 3: Autonomous Improvement

- Heartbeat-triggered reflection review.
- Safe auto-apply actions only (low-risk updates).
- Require confirmation for risky changes.

## Risks

1. Over-nudging can increase prompt bloat and reduce answer quality.
2. False positives in deterministic checks can block valid actions.
3. Reflection overhead can increase latency/cost if not bounded.
4. Global learnings may leak patterns across users if not scoped correctly.
5. Too-aggressive escalation to capable model can erase cost gains.

## Impact

Positive:
- Better reliability on tool-heavy flows.
- Fewer repeated tool failures.
- Clearer observability in traces and dashboard.
- Stronger foundation for self-improvement automation.

Potential negative:
- Slightly higher per-session compute overhead.
- More complex loop behavior and debugging surface.

## Success Metrics

- Reduction in repeated tool failures per session.
- Reduction in “claimed success but failed validation” incidents.
- Stable or improved completion quality with bounded cost increase.
- Reflection event coverage in traces for tool-heavy sessions.

## Cost Visibility

- Reflection session summaries now include:
  - `estimatedPromptOverheadTokens` (from injected reflection nudges)
  - `estimatedCostUsd` (input-token cost estimate from active model pricing)
- This provides a bounded, auditable estimate of reflection overhead per session.
