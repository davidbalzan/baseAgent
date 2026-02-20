import { resolve } from "node:path";
import {
  runAgentLoop,
  LoopEmitter,
  INJECTION_DEFENSE_PREAMBLE,
  detectSystemPromptLeakage,
  selectModel,
  type AppConfig,
  type LoopState,
  type ToolMessageMeta,
  type LanguageModel,
  type ModelPricing,
} from "@baseagent/core";
import type { CoreMessage } from "@baseagent/core";
import type {
  SessionRepository,
  TraceRepository,
  MessageRepository,
} from "@baseagent/memory";
import { loadMemoryFiles, resolveUserDir } from "@baseagent/memory";
import { exportSessionTrace } from "./trace-export.js";
import type { LiveSessionBus } from "./live-stream.js";
import {
  ToolRegistry,
  createToolExecutor,
  createGovernedExecutor,
  buildSandboxContext,
  selectTools,
  createMemoryReadTool,
  createMemoryWriteTool,
  type GovernancePolicy,
  type ConfirmationDelegate,
  type GovernanceRateLimiter,
} from "@baseagent/tools";

/** Resolve pricing: live fetch takes precedence, then config, then loop defaults. */
function resolvePricing(config: AppConfig, live?: ModelPricing): ModelPricing | undefined {
  if (live) return live;
  const input = config.llm.costPerMInputTokens;
  const output = config.llm.costPerMOutputTokens;
  if (input === undefined || output === undefined) return undefined;
  return { costPerMInputTokens: input, costPerMOutputTokens: output };
}

export interface RunSessionInput {
  input: string;
  channelId?: string;
  /** Prior exchanges from previous sessions on the same channel, for conversational continuity. */
  conversationHistory?: CoreMessage[];
  /** Reuse an existing session ID (resume). */
  sessionId?: string;
  initialMessages?: unknown[];
  initialToolMessageMeta?: ToolMessageMeta[];
  initialState?: Partial<LoopState>;
  /** Override the cost cap (e.g. accumulated + additional budget on resume). */
  costCapOverrideUsd?: number;
  /** Override max iterations (e.g. accumulated + additional on resume). */
  maxIterationsOverride?: number;
}

export interface RunSessionDeps {
  model: LanguageModel;
  registry: ToolRegistry;
  config: AppConfig;
  workspacePath: string;
  sessionRepo: SessionRepository;
  traceRepo: TraceRepository;
  messageRepo: MessageRepository;
  governancePolicy?: GovernancePolicy;
  confirmationDelegate?: ConfirmationDelegate;
  toolRateLimiter?: GovernanceRateLimiter;
  /** Live pricing fetched at startup (e.g. from OpenRouter API). Overrides config if set. */
  pricing?: ModelPricing;
  /** Pub/sub bus for streaming live session events to the dashboard (UI-2). */
  liveSessionBus?: LiveSessionBus;
  /** Stronger model for tool-heavy / coding tasks (dual-model routing). */
  capableModel?: LanguageModel;
  capablePricing?: ModelPricing;
}

export interface RunSessionResult {
  sessionId: string;
  output: string;
  state: LoopState;
}

export async function runSession(
  input: RunSessionInput,
  deps: RunSessionDeps,
  externalEmitter?: LoopEmitter,
): Promise<RunSessionResult> {
  const { registry, config, workspacePath, sessionRepo, traceRepo, messageRepo } = deps;

  // Dual-model routing: pick capable model when input signals tool/coding intent.
  const selection = selectModel(input.input, {
    default: { model: deps.model, pricing: resolvePricing(config, deps.pricing) },
    capable: deps.capableModel
      ? { model: deps.capableModel, pricing: deps.capablePricing }
      : undefined,
  });
  const model = selection.model;
  if (selection.routed) {
    console.log(`[model] Routed to capable model (${model.modelId}) for this session`);
  }

  // Resolve per-user workspace directory for memory segregation.
  // Shared files (SOUL.md, PERSONALITY.md, HEARTBEAT.md) load from workspace root.
  // Per-user files (USER.md, MEMORY.md) load from workspace/users/<userId>/.
  const userDir = input.channelId
    ? resolveUserDir(workspacePath, input.channelId, config.users?.links)
    : undefined;

  // Hot-reload memory files on every session so edits to SOUL.md etc. take
  // effect immediately without a server restart (MM-5).
  // Prepend the injection defense preamble so the model treats <user_input>
  // tagged content as untrusted (GV-6).
  const memoryContent = loadMemoryFiles(workspacePath, config.memory.maxTokenBudget, userDir);
  const now = new Date();
  const dateStamp = `Current date: ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}. Current time: ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}.`;
  const systemPrompt = `${INJECTION_DEFENSE_PREAMBLE}\n\n${dateStamp}\n\n${memoryContent}`;

  // 1. Create or reuse session (record the actual routed model, not the default)
  const sessionId = input.sessionId ?? sessionRepo.create({
    input: input.input,
    channelId: input.channelId,
    model: model.modelId,
  }).id;

  // 2. Set up emitter with trace persistence + live stream forwarding (UI-2)
  const emitter = externalEmitter ?? new LoopEmitter();
  emitter.on("trace", (event) => {
    traceRepo.insert(event);
  });

  const bus = deps.liveSessionBus;
  if (bus) {
    bus.emit({ type: "session_started", sessionId, channelId: input.channelId, input: input.input, ts: new Date().toISOString() });
    emitter.on("trace", (event) => {
      bus.emit({
        type: "trace_event",
        sessionId,
        phase: event.phase,
        iteration: event.iteration,
        data: event.data,
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
        ts: event.timestamp,
      });
    });
  }

  // 3. Build tool executor with governance wrapper
  const rawExecutor = createToolExecutor(
    (name) => registry.get(name),
    (toolName) => {
      const tool = registry.get(toolName);
      if (tool?.permission !== "exec") return undefined;
      return buildSandboxContext(toolName, workspacePath, config);
    },
  );
  const defaultPolicy: GovernancePolicy = { read: "auto-allow", write: "confirm", exec: "confirm" };
  const executeTool = createGovernedExecutor(rawExecutor, {
    policy: deps.governancePolicy ?? defaultPolicy,
    getToolDefinition: (name) => registry.get(name),
    confirmationDelegate: deps.confirmationDelegate,
    emitter,
    sessionId,
    rateLimiter: deps.toolRateLimiter,
  });

  // 4. Run agent loop
  let result;
  try {
    const { tools, selectedCount, totalCount, activeGroups } = selectTools(input.input, registry.getAll());
    if (selectedCount < totalCount) {
      console.log(`[tools] Filtered ${selectedCount}/${totalCount} tools for session` +
        (activeGroups.length ? ` (groups: ${activeGroups.join(", ")})` : ""));
    }

    // Overlay per-user memory tools so USER.md/MEMORY.md are segregated per user.
    if (userDir) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools.memory_read = createMemoryReadTool(workspacePath, userDir) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools.memory_write = createMemoryWriteTool(workspacePath, userDir) as any;
    }

    result = await runAgentLoop(input.input, {
      model,
      systemPrompt,
      tools,
      executeTool,
      maxIterations: input.maxIterationsOverride ?? config.agent.maxIterations,
      timeoutMs: config.agent.timeoutMs,
      costCapUsd: input.costCapOverrideUsd ?? config.agent.costCapUsd,
      sessionId,
      compactionThreshold: config.memory.compactionThreshold,
      workspacePath,
      toolOutputDecayIterations: config.memory.toolOutputDecayIterations,
      toolOutputDecayThresholdChars: config.memory.toolOutputDecayThresholdChars,
      pricing: selection.pricing,
      conversationHistory: input.conversationHistory,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialMessages: input.initialMessages as any,
      initialToolMessageMeta: input.initialToolMessageMeta,
      initialState: input.initialState,
    }, emitter);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sessionRepo.updateStatus(sessionId, "failed", message);
    throw err;
  }

  // 5. Persist messages
  const iterationMap = new Map<number, number>();
  for (const meta of result.toolMessageMeta) {
    iterationMap.set(meta.messageIndex, meta.iteration);
  }
  messageRepo.saveSessionMessages(sessionId, result.messages, iterationMap);

  // 6. Update session status + usage
  sessionRepo.updateStatus(sessionId, result.state.status, result.output);
  sessionRepo.updateUsage(sessionId, {
    totalTokens: result.state.totalTokens,
    promptTokens: result.state.promptTokens,
    completionTokens: result.state.completionTokens,
    totalCostUsd: result.state.estimatedCostUsd,
    iterations: result.state.iteration,
  });

  // 7a. Broadcast session completion to live-stream clients (UI-2)
  bus?.emit({ type: "session_completed", sessionId, status: result.state.status, ts: new Date().toISOString() });

  // 7. Export Markdown trace (OB-2) — non-fatal
  const rootDir = resolve(workspacePath, "..");
  exportSessionTrace(rootDir, sessionId, input.input, result.state, traceRepo);

  // 8. Output leakage check (GV-6) — warn if the model appears to have
  //    echoed back verbatim content from the system prompt.
  if (detectSystemPromptLeakage(result.output, systemPrompt)) {
    console.warn(`[security] Possible system prompt leakage detected in session ${sessionId}`);
  }

  return { sessionId, output: result.output, state: result.state };
}
