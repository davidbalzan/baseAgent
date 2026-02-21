import { resolve } from "node:path";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import {
  runAgentLoop,
  LoopEmitter,
  INJECTION_DEFENSE_PREAMBLE,
  INJECTION_DEFENSE_PREAMBLE_COMPACT,
  detectSystemPromptLeakage,
  selectModel,
  createLogger,
  type AppConfig,
  type LoopState,
  type ToolMessageMeta,
  type LanguageModel,
  type ModelPricing,
  type ToolDefinition,
  type ReflectionSessionSummary,
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

const modelLog = createLogger("model");
const toolsLog = createLogger("tools");
const securityLog = createLogger("security");

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
  initialMessages?: CoreMessage[];
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
  reflectionSummary?: ReflectionSessionSummary;
}

function persistReflectionSummaryToUserMemory(baseDir: string, summary: ReflectionSessionSummary): void {
  const filePath = resolve(baseDir, "USER.md");
  const ts = new Date().toISOString();
  const block = [
    "",
    "",
    `## Reflection Summary ${ts}`,
    "",
    `- Pre-checks: ${summary.preChecks}`,
    `- Blocked calls: ${summary.blockedCalls}`,
    `- High-risk calls: ${summary.highRiskCalls}`,
    `- Post-checks: ${summary.postChecks}`,
    `- Post-check errors: ${summary.postErrors}`,
    `- Reflection nudges: ${summary.nudgesInjected}`,
    `- Reflection prompt overhead (est tokens): ${summary.estimatedPromptOverheadTokens}`,
    `- Reflection cost overhead (est USD): $${summary.estimatedCostUsd.toFixed(6)}`,
  ].join("\n");

  if (!existsSync(filePath)) {
    writeFileSync(filePath, `# USER\n${block}\n`, "utf-8");
    return;
  }
  appendFileSync(filePath, `${block}\n`, "utf-8");
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
    modelLog.log(`Routed to capable model (${model.modelId}) for this session`);
  }

  // Resolve per-user workspace directory for memory segregation.
  // Shared files (SOUL.md, PERSONALITY.md, HEARTBEAT.md) load from workspace root.
  // Per-user files (USER.md, MEMORY.md) load from workspace/users/<userId>/.
  const userDir = input.channelId
    ? resolveUserDir(workspacePath, input.channelId, config.users?.links)
    : undefined;

  // Hot-reload memory files on every session so edits to SOUL.md etc. take
  // effect immediately without a server restart (MM-5).
  // Use compact soul for the default (cheap) model, full soul for the capable model.
  // Prepend the injection defense preamble so the model treats <user_input>
  // tagged content as untrusted (GV-6).
  const useCompactSoul = !selection.routed && !!deps.capableModel;
  const memoryContent = loadMemoryFiles(workspacePath, config.memory.maxTokenBudget, userDir, {
    compact: useCompactSoul,
  });
  const now = new Date();
  const isoNow = now.toISOString();
  const tzOffsetMin = -now.getTimezoneOffset();
  const tzSign = tzOffsetMin >= 0 ? "+" : "-";
  const tzH = String(Math.floor(Math.abs(tzOffsetMin) / 60)).padStart(2, "0");
  const tzM = String(Math.abs(tzOffsetMin) % 60).padStart(2, "0");
  const tzLabel = `UTC${tzSign}${tzH}:${tzM}`;
  const dateStamp = `Current date: ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}. Current time: ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })} (${tzLabel}). ISO timestamp: ${isoNow}.`;
  const preamble = useCompactSoul ? INJECTION_DEFENSE_PREAMBLE_COMPACT : INJECTION_DEFENSE_PREAMBLE;
  const systemPrompt = `${preamble}\n\n${dateStamp}\n\n${memoryContent}`;

  // Trim conversation history for compact model to save context window.
  // The full budget (40K) is excessive for cheap models — cap at ~6K tokens.
  let conversationHistory = input.conversationHistory;
  if (useCompactSoul && conversationHistory?.length) {
    const COMPACT_HISTORY_TOKEN_BUDGET = 6000;
    let tokens = 0;
    let keepFrom = 0;
    // Walk backwards (newest first) to preserve most recent context.
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const msg = conversationHistory[i];
      const len = typeof msg.content === "string" ? msg.content.length : JSON.stringify(msg.content).length;
      tokens += Math.ceil(len / 4);
      if (tokens > COMPACT_HISTORY_TOKEN_BUDGET) {
        keepFrom = i + 1;
        break;
      }
    }
    if (keepFrom > 0) {
      conversationHistory = conversationHistory.slice(keepFrom);
      modelLog.log(`Compact mode: trimmed conversation history to ${conversationHistory.length} messages (~${tokens} tokens)`);
    }
  }

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

  // 3. Select and overlay tools BEFORE building executor so the executor
  //    resolves overlaid versions (schedule_task with channelId, per-user memory).
  const { tools, selectedCount, totalCount, activeGroups } = selectTools(input.input, registry.getAll(), workspacePath);
  if (selectedCount < totalCount) {
    toolsLog.log(`Filtered ${selectedCount}/${totalCount} tools for session` +
      (activeGroups.length ? ` (groups: ${activeGroups.join(", ")})` : ""));
  }

  // Overlay per-user memory tools so USER.md/MEMORY.md are segregated per user.
  if (userDir) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools.memory_read = createMemoryReadTool(workspacePath, userDir) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools.memory_write = createMemoryWriteTool(workspacePath, userDir) as any;
  }

  // Overlay schedule_task to inject the session's channelId so reminders
  // are always delivered back to the originating channel (e.g. Telegram chat).
  // The LLM almost never passes channelId explicitly, so bake it in.
  if (input.channelId && tools.schedule_task) {
    const original = tools.schedule_task;
    tools.schedule_task = {
      ...original,
      async execute(args: Record<string, unknown>) {
        // Inject channelId if the LLM didn't provide one
        if (!args.channelId) {
          args.channelId = input.channelId;
        }
        return original.execute(args);
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  // 4. Build tool executor with governance wrapper.
  //    Resolve from the overlaid `tools` map first, falling back to the registry
  //    for tools that weren't selected/overlaid (e.g. MCP tools).
  const resolveTool = (name: string) => tools[name] as ToolDefinition | undefined ?? registry.get(name);
  const rawExecutor = createToolExecutor(
    resolveTool,
    (toolName) => {
      const tool = resolveTool(toolName);
      if (tool?.permission !== "exec") return undefined;
      return buildSandboxContext(toolName, workspacePath, config);
    },
    { defaultMaxOutputChars: config.agent.defaultMaxOutputChars },
  );
  const defaultPolicy: GovernancePolicy = { read: "auto-allow", write: "confirm", exec: "confirm" };
  const executeTool = createGovernedExecutor(rawExecutor, {
    policy: deps.governancePolicy ?? defaultPolicy,
    getToolDefinition: resolveTool,
    confirmationDelegate: deps.confirmationDelegate,
    emitter,
    sessionId,
    rateLimiter: deps.toolRateLimiter,
  });

  // 5. Run agent loop
  let result;
  try {
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
      userDir,
      // Aggressive decay for compact model: 2 iterations / 300 chars vs default 6 / 5000.
      toolOutputDecayIterations: useCompactSoul
        ? Math.min(config.memory.toolOutputDecayIterations, 2)
        : config.memory.toolOutputDecayIterations,
      toolOutputDecayThresholdChars: useCompactSoul
        ? Math.min(config.memory.toolOutputDecayThresholdChars, 300)
        : config.memory.toolOutputDecayThresholdChars,
      pricing: selection.pricing,
      compactionModel: deps.capableModel,
      conversationHistory,
      initialMessages: input.initialMessages,
      initialToolMessageMeta: input.initialToolMessageMeta,
      initialState: input.initialState,
      reflection: config.reflection,
      stageRouting: {
        enabled: config.llm.stageRouting?.enabled ?? false,
        capableModel: deps.capableModel,
        capablePricing: deps.capablePricing,
        escalationConsecutiveErrorIterations: config.llm.stageRouting?.escalationConsecutiveErrorIterations,
        maxCapableIterations: config.llm.stageRouting?.maxCapableIterations,
        maxCapableCostUsd: config.llm.stageRouting?.maxCapableCostUsd,
      },
      maxNarrationNudges: config.agent.maxNarrationNudges,
      maxFinishGateNudges: config.agent.maxFinishGateNudges,
    }, emitter);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sessionRepo.updateStatus(sessionId, "failed", message);
    throw err;
  }

  // 6. Persist messages
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

  if (config.reflection?.enabled && config.reflection?.persistToUserMemory && result.reflectionSummary && userDir) {
    persistReflectionSummaryToUserMemory(userDir, result.reflectionSummary);
  }

  // 7a. Broadcast session completion to live-stream clients (UI-2)
  bus?.emit({ type: "session_completed", sessionId, status: result.state.status, ts: new Date().toISOString() });

  // 7. Export Markdown trace (OB-2) — non-fatal
  const rootDir = resolve(workspacePath, "..");
  exportSessionTrace(rootDir, sessionId, input.input, result.state, traceRepo);

  // 8. Output leakage check (GV-6) — warn if the model appears to have
  //    echoed back verbatim content from the system prompt.
  if (detectSystemPromptLeakage(result.output, systemPrompt)) {
    securityLog.warn(`Possible system prompt leakage detected in session ${sessionId}`);
  }

  return {
    sessionId,
    output: result.output,
    state: result.state,
    reflectionSummary: result.reflectionSummary,
  };
}
