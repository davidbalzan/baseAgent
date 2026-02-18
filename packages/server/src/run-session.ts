import {
  runAgentLoop,
  LoopEmitter,
  type AppConfig,
  type LoopState,
  type ToolMessageMeta,
  type LanguageModel,
} from "@baseagent/core";
import type {
  SessionRepository,
  TraceRepository,
  MessageRepository,
} from "@baseagent/memory";
import {
  ToolRegistry,
  createToolExecutor,
  createGovernedExecutor,
  buildSandboxContext,
  type GovernancePolicy,
  type ConfirmationDelegate,
  type GovernanceRateLimiter,
} from "@baseagent/tools";

export interface RunSessionInput {
  input: string;
  channelId?: string;
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
  systemPrompt: string;
  registry: ToolRegistry;
  config: AppConfig;
  workspacePath: string;
  sessionRepo: SessionRepository;
  traceRepo: TraceRepository;
  messageRepo: MessageRepository;
  governancePolicy?: GovernancePolicy;
  confirmationDelegate?: ConfirmationDelegate;
  toolRateLimiter?: GovernanceRateLimiter;
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
  const { model, systemPrompt, registry, config, workspacePath, sessionRepo, traceRepo, messageRepo } = deps;

  // 1. Create or reuse session
  const sessionId = input.sessionId ?? sessionRepo.create({
    input: input.input,
    channelId: input.channelId,
  }).id;

  // 2. Set up emitter with trace persistence
  const emitter = externalEmitter ?? new LoopEmitter();
  emitter.on("trace", (event) => {
    traceRepo.insert(event);
  });

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
    result = await runAgentLoop(input.input, {
      model,
      systemPrompt,
      tools: registry.getAll(),
      executeTool,
      maxIterations: input.maxIterationsOverride ?? config.agent.maxIterations,
      timeoutMs: config.agent.timeoutMs,
      costCapUsd: input.costCapOverrideUsd ?? config.agent.costCapUsd,
      sessionId,
      compactionThreshold: config.memory.compactionThreshold,
      workspacePath,
      toolOutputDecayIterations: config.memory.toolOutputDecayIterations,
      toolOutputDecayThresholdChars: config.memory.toolOutputDecayThresholdChars,
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

  return { sessionId, output: result.output, state: result.state };
}
