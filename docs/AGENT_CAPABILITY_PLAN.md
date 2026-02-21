# Agent Capability Plan (Core vs External)

Status: In progress (Phase A.1 started)
Date: 2026-02-21
Owner: Runtime + Plugin Architecture

## Objective

Map the major missing capabilities (beyond reflection) to the correct implementation layer:

- `core` = behavior that must be consistent across all channels/plugins
- `external/plugin` = optional domain integrations, specialized workflows, or UI/ops enhancements

This keeps architecture clean, avoids duplicated logic, and preserves plugin independence.

## Principles for Placement

Put a feature in `core` when it:
- affects loop correctness/safety globally,
- changes model/tool execution semantics,
- must appear in traces/session state uniformly.

Put a feature in `external/plugin` when it:
- depends on a specific domain/tool vendor,
- is optional for many deployments,
- is UI/operator specific and not runtime-critical.

## Capability Map

| Capability Gap | Priority | Core | External / Plugin | Why split this way |
|---|---:|---|---|---|
| Structured planning + replanning | High | Plan state machine, plan traces, replan triggers, completion checks | Domain planning templates (travel, coding, support ops) | Loop-level behavior must be consistent; templates vary by use case |
| Goal completion verification | High | Verify-before-finish policy, evidence schema, finish gate | Tool-specific verifiers (e.g. ticket exists, PR opened) | Gate is universal; evidence adapters are domain-specific |
| Perception / multimodal ingestion | Medium-High | Unified attachment/message envelope, confidence fields | OCR/PDF/image parsers, connectors, screen tools | Core should only define contracts; parsers are optional integrations |
| Multi-agent collaboration | Medium-High | Delegation protocol, handoff schema, budget/timeout guards | Specialist workers (researcher, verifier, coder), routing strategies | Protocol global; agents are pluggable |
| Safety hardening for actions | High | Preconditions/idempotency policy, post-action verification hooks, rollback semantics | Connector-level rollback implementations | Policy belongs in core; actual rollback logic depends on tool |
| Continuous self-improvement automation | Medium | Scheduler hooks, risk tiers, safe auto-apply engine | Improvement packs (new skills, group registrars, dashboards) | Safety policy global; improvement content modular |
| Efficiency policy engine (cost-aware routing) | High | Stage-based model policy, token budget caps, escalation matrix | Provider-specific pricing fetchers/tuning | Routing policy global; pricing integrations provider-specific |
| Observability and trust UX | Medium | Reflection/planning metrics in traces/session summary | Dashboard tabs/charts/alerts | Data source global; presentation pluggable |

## Proposed Work Breakdown

### Phase A — Runtime Reliability Core (must-have)

1. Plan/verify loop primitives in `packages/core`
   - Add plan phases: `plan`, `verify`, `replan`
   - Add finish gate requiring minimal evidence contract

Implementation status:
- `plan`, `verify`, `replan` trace phases implemented.
- Deterministic finish gate heuristic implemented (bounded nudge).
- Evidence-aware finish checks added for scheduler claims (avoid false "cancelled"/"scheduled" summaries without successful tool evidence).
- Evidence-aware finish checks expanded for memory updates, plugin install/remove, and file change claims.
- Stage-based capable-model escalation implemented with budget caps (`llm.stageRouting`).
2. Cost-aware stage routing in `packages/core` + `packages/server`
   - Route by stage (actor/critic/verifier), not only keyword
   - Hard per-session overhead caps (reflection/planning)
3. Action safety in `packages/core`
   - Idempotency metadata for high-impact tools
   - Standard post-action verification hook

### Phase B — External Capability Packs

1. Verification adapters (plugin layer)
   - Scheduler/task verifier
   - Git/PR verifier
   - File mutation verifier
2. Multimodal adapters (plugin layer)
   - Document extraction plugin
   - Image/screenshot interpretation plugin
3. Specialist worker plugins
   - `research_worker`, `execution_worker`, `verification_worker`

### Phase C — Operator Experience

1. Dashboard metrics tab (plugin)
   - plan success, verify failures, retries, reflection overhead
2. Alerting hooks (plugin)
   - repeated failure alerts, runaway cost alerts

## Risks and Impacts

### Risks

1. Core bloat risk
   - Too much domain logic in core would reduce plugin flexibility.
   - Mitigation: keep only protocols/policies in core; adapters in plugins.

2. Latency and cost inflation
   - Extra planning/verification passes can increase runtime cost.
   - Mitigation: strict stage budget caps and escalation policy.

3. False-positive verification blocks
   - Overly strict finish gates can block valid outcomes.
   - Mitigation: confidence thresholds + override via governance-confirmed action.

4. Multi-agent coordination failure
   - Worker handoffs may create deadlocks or duplicated work.
   - Mitigation: explicit handoff contract + max delegation depth.

### Expected Impact

Positive:
- Higher action reliability and lower hallucinated completion claims.
- Better cost predictability through stage-aware routing.
- Cleaner architecture: core policy + plugin capability packs.

Trade-offs:
- More runtime complexity and expanded test surface.
- Additional instrumentation and schema migration effort.

## Immediate Next Actions

1. Implement Phase A.1 (plan/verify/replan traces + finish gate) in core.
2. Implement Phase A.2 (stage-based model routing policy).
3. Add dashboard visibility for reflection + verification overhead.

## Success Criteria

- 30%+ reduction in repeated tool-failure loops.
- 20%+ reduction in incorrect "task complete" outputs.
- Reflection/planning overhead remains <= 15% token budget in median sessions.
- No regressions in existing test suite.
