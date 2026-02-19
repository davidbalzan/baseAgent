# Pending Work

> Derived from PRD coverage audit (2026-02-19). Items ordered by priority.

---

## P0 — Critical

- [x] **MM-4** Auto-compaction — already implemented in `core/loop/compaction.ts` + wired into `agent-loop.ts` via `compactionThreshold`

---

## P1 — High Priority

### Memory
- [x] **MM-5** Memory file hot-reload — `loadMemoryFiles` now called inside `runSession` on every call; no restart needed
- [x] **MM-6** Enforce append-only semantics on `MEMORY.md` — `assertNotProtectedMemoryFile()` in `_utils.ts` blocks `file_write` and `file_edit` from touching any memory file; agent must use `memory_write`

### Gateway
- [ ] **GW-10** Mid-task message injection — buffer new inbound messages during a running session and surface them to the model
- [ ] **GW-11** Media support — normalize images/files received on Telegram/Discord/Slack into a common format passable to the model
- [ ] **GW-12** Dynamic adapter loading from `skills/` — new channel adapters loadable without core code changes
- [ ] **GW-13** Channel-specific output formatting — adapter-level post-processing (Markdown for Discord/Slack, plain text for SMS)

### Observability
- [x] **OB-2** Markdown trace export — written to `traces/YYYY-MM-DD-{short-id}.md` via `trace-export.ts` after each session

### Governance
- [x] **GV-6** Prompt injection defense — XML tagging (`wrapUserInput`), injection heuristics on tool args + `injection_attempt` trace events, system prompt leakage detection in `run-session.ts`; all in `core/loop/injection-defense.ts`

### Tools
- [ ] **TS-9** Tool progress streaming — long-running tools emit partial updates during execution

### UI
- [x] **UI-2** Live session view — SSE stream at `/api/live`; `LiveSessionBus` in `live-stream.ts` forwards `trace_event`, `session_started`, `session_completed` to all connected dashboard clients; live trace events append in real-time to the open session detail
- [x] **UI-3** Memory file editor — "Memory" tab in dashboard; `GET /api/memory` lists all 5 files, `PUT /api/memory/:file` saves edits; inline textarea editor per card
- [ ] **UI-4** Heartbeat status dashboard — last run time, next scheduled run, result history
- [x] **UI-5** Mobile-responsive dashboard — stack layout on ≤700px, hamburger menu for tabs, slide-in session detail with back button, 3-col stats grid on mobile

---

## P2 — Nice to Have

- [ ] **MM-7** Embedding-based retrieval for long-term memory (SQLite vector extension)
- [ ] **GW-2** WhatsApp adapter (official Cloud API — revisit post-v1)
- [ ] **GW-6** Signal adapter
- [ ] **GW-7** iMessage adapter (macOS only)
- [ ] **ML-5** Validate local model support via Ollama end-to-end
- [ ] **OB-5** Eval harness — run sample tasks, score success/cost/steps in CI
- [ ] **PT-5** Background pollers — configurable recurring async tasks (e.g., inbox check every 5 min)
- [ ] **TS-10** `baseagent skill install <repo-url>` — git-based skill installer
- [ ] **MA-1–5** Multi-agent primitives (sub-agents, inter-agent messaging, routing)
