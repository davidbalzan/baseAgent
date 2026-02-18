# Reference: pi-mono Agent Patterns

> **Purpose:** Capture patterns from [badlogic/pi-mono](https://github.com/badlogic/pi-mono) worth adopting in baseAgent. Not a dependency — inspiration for future implementation.
>
> **Date:** 2026-02-18
> **Status:** Reference — patterns to adopt incrementally into `@baseagent/core`

---

## Why This Matters

pi-mono (13k+ stars) solves problems we'll hit as baseAgent matures: agent interruption, multi-model handoff, subagent orchestration, and state persistence. Their patterns are proven in production via the pi-coding-agent CLI. We stay on Vercel AI SDK + Zod (ADR-005, ADR-007) but borrow the architectural ideas.

---

## Pattern 1: Agent State Machine

**What pi-agent-core does:**
Three explicit states: `Idle`, `Streaming`, `ProcessingTools`. An `isStreaming` flag prevents concurrent operations. All state lives in a single serializable `AgentState` object.

**Why it matters:**
Our `runAgentLoop` currently uses implicit state (local variables inside a while loop). An explicit state machine would enable:
- Pause/resume across server restarts
- State inspection for debugging/observability
- Clearer error recovery per state

**How to adopt:**
Extract `LoopState` into a proper state machine with explicit transitions. Keep it in `@baseagent/core`. Serialize to SQLite sessions table for resumability.

```
Idle → Streaming → ProcessingTools → Streaming → ... → Idle
                                   ↘ Idle (on finish/error)
```

---

## Pattern 2: Message Steering & Queuing

**What pi-agent-core does:**
Two mechanisms for delivering user input mid-execution:
- `steer(message)` — interrupts after current tool execution, skips remaining tools. For user corrections.
- `followUp(message)` — waits for current execution to complete, then delivers. For additional context.

Both support `one-at-a-time` (default for steering) and `all-at-once` delivery modes.

**Why it matters:**
Currently our Telegram adapter fires one message → one full loop execution. No way for a user to say "stop, change approach" mid-run. Steering would allow:
- User sends correction while agent is running tools
- Agent finishes current tool, skips the rest, processes correction
- Chat-like multi-turn without waiting for full completion

**How to adopt:**
Add a message queue to the agent loop. Check queue between tool executions. Implement as an optional feature — channel adapters that support it (Telegram, Discord) can use it, HTTP endpoint doesn't need it.

```ts
// Conceptual API
interface AgentSession {
  steer(message: string): void;   // interrupt after current tool
  followUp(message: string): void; // queue for after completion
}
```

---

## Pattern 3: Mid-Session Model Handoff

**What pi-ai does:**
Switch LLM providers mid-conversation while preserving full context (including thinking blocks, tool calls, and tool results). Conversation context is serialized in a provider-agnostic format.

**Why it matters:**
Use cases:
- Start with a fast/cheap model for planning, switch to a capable model for execution
- Fall back to a different provider if one hits rate limits
- Use a reasoning model for complex decisions, then a fast model for tool calls

**How to adopt:**
Our `runAgentLoop` already takes `model` as a parameter. The gap is that `messages: CoreMessage[]` is built inside the loop and discarded. To enable handoff:
1. Expose the message history from a completed/paused loop
2. Accept prior message history as input to a new loop
3. Ensure message format is provider-agnostic (Vercel AI SDK's `CoreMessage` already handles this)

---

## Pattern 4: Streaming Granularity

**What pi-ai does:**
Separate event pairs for each content type:
- `text_start` / `text_delta` / `text_end`
- `thinking_start` / `thinking_delta` / `thinking_end`
- `toolcall_start` / `toolcall_delta` / `toolcall_end`

Tool arguments arrive as incremental JSON during streaming — UI can show partial tool inputs before execution starts.

**Why it matters:**
Our `LoopEmitter` currently has `text_delta` and `tool_call` (fired once when complete). Adding start/end boundaries and thinking events would enable:
- Progress indicators that know when a phase starts/ends
- Showing partial tool arguments as they stream in
- Surfacing model reasoning/thinking to the user

**How to adopt:**
Extend `LoopEventMap` with additional events. Non-breaking — existing listeners continue to work.

```ts
// Additional events to consider
interface ExtendedLoopEventMap extends LoopEventMap {
  thinking_delta: [delta: string];
  tool_call_start: [toolName: string, toolCallId: string];
  tool_call_args_delta: [toolCallId: string, argsDelta: string];
}
```

---

## Pattern 5: Subagent Orchestration

**What pi-agent-core does:**
Three execution modes:
- **Single** — delegate one task to a specialized agent
- **Parallel** — up to 8 concurrent agents for independent tasks
- **Chain** — sequential agents where output feeds into next input via `{previous}` placeholder

Plus dynamic agent generation — if a named agent doesn't exist, create one on the fly with a specified scope.

**Why it matters:**
For complex tasks like "research this topic, create a plan, then implement it" — a single agent loop with one system prompt is suboptimal. Subagents allow:
- Specialized system prompts per subtask
- Parallel research with isolated context windows
- Cost optimization — use cheap models for scouting, expensive ones for execution

**How to adopt:**
This is a v2+ feature. When ready:
1. Create a `subagent` tool in `@baseagent/tools`
2. Each subagent gets its own `runAgentLoop` call with a tailored system prompt
3. Results flow back as tool results to the parent agent
4. Limit concurrency (pi-mono caps at 8)

```ts
// Conceptual tool definition
{
  name: "subagent",
  parameters: z.object({
    task: z.string(),
    mode: z.enum(["single", "parallel", "chain"]).default("single"),
    tasks: z.array(z.object({ task: z.string() })).optional(),
  }),
}
```

---

## Pattern 6: Transport Independence

**What pi-agent-core does:**
The agent doesn't know about LLM mechanics. A `streamFn` interface abstracts all LLM communication — you can inject custom implementations (proxies, middleware, mock for testing).

**Why it matters:**
Our loop currently calls `streamText()` directly from the Vercel AI SDK. Wrapping this behind an interface would enable:
- Easy unit testing with mock LLM responses
- Request/response middleware (logging, rate limiting, retries)
- Swapping the entire LLM layer without touching agent logic

**How to adopt:**
Define a `StreamFn` type in `@baseagent/core`. Default implementation wraps Vercel's `streamText`. Tests can inject a mock.

```ts
type StreamFn = (messages: CoreMessage[], tools: Record<string, CoreTool>) => AsyncIterable<StreamPart>;
```

---

## Implementation Priority

| Pattern | Priority | Effort | When |
|---------|----------|--------|------|
| Streaming granularity | Medium | Small | When adding thinking model support |
| Agent state machine | Medium | Medium | When adding pause/resume |
| Transport independence | Medium | Small | When adding tests for agent loop |
| Message steering | Low | Medium | When Telegram UX needs improvement |
| Model handoff | Low | Small | When multi-model workflows needed |
| Subagent orchestration | Low | Large | v2+ |

---

## References

- [pi-mono GitHub](https://github.com/badlogic/pi-mono)
- [pi-agent-core DeepWiki](https://deepwiki.com/badlogic/pi-mono/3-@mariozechnerpi-agent-core)
- [pi-ai package](https://github.com/badlogic/pi-mono/tree/main/packages/ai)
- [Mario Zechner: Building a coding agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)
- [Nader: Building with PI](https://nader.substack.com/p/how-to-build-a-custom-agent-framework)
