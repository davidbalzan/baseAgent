import { Hono } from "hono";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..", "..", "..");

import {
  loadConfig,
  resolveModel,
  getFallbackModelStatus,
  resolveModelWithFallbacks,
  LoopEmitter,
  fetchOpenRouterPricing,
  createLogger,
  type AppConfig,
  type CoreMessage,
  type LanguageModel,
  type ModelPricing,
  type PluginContext,
  type ChannelAdapterLike,
} from "@baseagent/core";
import {
  initDatabase,
  pushSchema,
  SessionRepository,
  TraceRepository,
  MessageRepository,
  deserializeMessages,
  parseBotName,
} from "@baseagent/memory";
import {
  ToolRegistry,
  checkDockerAvailability,
  type GovernancePolicy,
  type ConfirmationDelegate,
} from "@baseagent/tools";
import {
  createQueuedHandler,
  createProactiveMessenger,
  type HandleMessageFn,
} from "@baseagent/gateway";

import { healthRoute } from "./health.js";
import { LiveSessionBus } from "./live-stream.js";
import { runSession, type RunSessionDeps } from "./run-session.js";
import { createDashboardApi } from "./dashboard-api.js";
import { SlidingWindowLimiter, createRateLimitMiddleware } from "./rate-limit.js";
import { loadPlugins } from "./plugins/plugin-loader.js";
import { resolvePlugins } from "./plugins/resolve-plugins.js";
import { createBuiltInToolsPlugin, createSkillReloader } from "./plugins/built-in-tools.plugin.js";
import { buildConversationHistory } from "./conversation-history.js";
import { injectPluginTabs } from "./dashboard/inject-tabs.js";
import type { LoopState } from "@baseagent/core";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function toBaseUrl(url?: string): string {
  return (url ?? "http://127.0.0.1:4096").replace(/\/+$/, "");
}

async function isOpenCodeAvailable(baseUrl?: string): Promise<boolean> {
  const healthUrl = `${toBaseUrl(baseUrl)}/session/status`;
  try {
    const response = await fetch(healthUrl);
    return response.ok;
  } catch {
    return false;
  }
}

function sanitizeFallbacks(
  fallbacks: AppConfig["llm"]["fallbackModels"] | undefined,
): NonNullable<AppConfig["llm"]["fallbackModels"]> {
  return (fallbacks ?? []).filter((fb) => fb.provider !== "opencode");
}

function copyFallbackPricingToCapable(
  target: NonNullable<AppConfig["llm"]["capableModel"]>,
  fallback: { costPerMInputTokens?: number; costPerMOutputTokens?: number },
): NonNullable<AppConfig["llm"]["capableModel"]> {
  return {
    ...target,
    ...(fallback.costPerMInputTokens !== undefined ? { costPerMInputTokens: fallback.costPerMInputTokens } : {}),
    ...(fallback.costPerMOutputTokens !== undefined ? { costPerMOutputTokens: fallback.costPerMOutputTokens } : {}),
  };
}

async function disableOpenCodeIfUnavailable(config: AppConfig, log: ReturnType<typeof createLogger>): Promise<void> {
  const hasOpenCodeInPrimary = config.llm.provider === "opencode";
  const hasOpenCodeInFallbacks = (config.llm.fallbackModels ?? []).some((fb) => fb.provider === "opencode");
  const hasOpenCodeInCapable = config.llm.capableModel?.provider === "opencode";
  const hasOpenCodeInCapableFallbacks = (config.llm.capableFallbackModels ?? []).some((fb) => fb.provider === "opencode");
  const hasOpenCodeConfigured =
    hasOpenCodeInPrimary || hasOpenCodeInFallbacks || hasOpenCodeInCapable || hasOpenCodeInCapableFallbacks;

  if (!hasOpenCodeConfigured) return;

  const openCodeBaseUrl = config.llm.providers?.opencode?.baseUrl;
  const isAvailable = await isOpenCodeAvailable(openCodeBaseUrl);
  if (isAvailable) return;

  log.warn(`OpenCode unavailable at ${toBaseUrl(openCodeBaseUrl)} — disabling opencode provider at startup`);

  const sanitizedFallbacks = sanitizeFallbacks(config.llm.fallbackModels);

  if (hasOpenCodeInPrimary) {
    const promoted = sanitizedFallbacks[0];
    if (!promoted) {
      throw new Error("OpenCode is unavailable and no non-opencode fallback model is configured");
    }

    config.llm.provider = promoted.provider;
    config.llm.model = promoted.model;
    config.llm.apiKey = promoted.apiKey ?? config.llm.apiKey;
    config.llm.fallbackModels = sanitizedFallbacks.slice(1);
    log.warn(`Promoted fallback ${promoted.provider}/${promoted.model} as startup primary model`);
  } else {
    config.llm.fallbackModels = sanitizedFallbacks;
  }

  const capableFallbacksBase = config.llm.capableFallbackModels ?? config.llm.fallbackModels ?? [];
  const sanitizedCapableFallbacks = capableFallbacksBase.filter((fb) => fb.provider !== "opencode");

  if (hasOpenCodeInCapable && config.llm.capableModel) {
    const promotedCapable = sanitizedCapableFallbacks[0];
    if (!promotedCapable) {
      config.llm.capableModel = undefined;
      config.llm.capableFallbackModels = [];
      log.warn("Disabled capable model because it was opencode and no non-opencode capable fallback is configured");
    } else {
      config.llm.capableModel = copyFallbackPricingToCapable(
        {
          ...config.llm.capableModel,
          provider: promotedCapable.provider,
          model: promotedCapable.model,
        },
        promotedCapable,
      );
      config.llm.capableFallbackModels = sanitizedCapableFallbacks.slice(1);
      log.warn(`Promoted capable fallback ${promotedCapable.provider}/${promotedCapable.model} as capable model`);
    }
  } else {
    config.llm.capableFallbackModels = sanitizedCapableFallbacks;
  }
}

function setOpenCodeDirectoryDefault(config: AppConfig, defaultDirectory: string): void {
  const usesOpenCode =
    config.llm.provider === "opencode" ||
    (config.llm.fallbackModels ?? []).some((fb) => fb.provider === "opencode") ||
    config.llm.capableModel?.provider === "opencode" ||
    (config.llm.capableFallbackModels ?? []).some((fb) => fb.provider === "opencode");

  if (!usesOpenCode) return;

  config.llm.providers ??= {};
  config.llm.providers.opencode ??= {};
  if (!config.llm.providers.opencode.directory || config.llm.providers.opencode.directory.trim() === "") {
    config.llm.providers.opencode.directory = defaultDirectory;
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface AgentBootstrap {
  config: AppConfig;
  workspacePath: string;
  registry: ToolRegistry;
  sessionDeps: RunSessionDeps;
  liveSessionBus: LiveSessionBus;
  app: Hono;
  shutdown: () => Promise<void>;
}

export async function bootstrapAgent(configPath?: string): Promise<AgentBootstrap> {
  const configLog = createLogger("config");
  const dbLog = createLogger("db");
  const modelLog = createLogger("model");
  const govLog = createLogger("governance");
  const sandboxLog = createLogger("sandbox");
  const rateLimitLog = createLogger("rate-limit");
  const pricingLog = createLogger("pricing");
  const memoryLog = createLogger("memory");
  const dashboardLog = createLogger("dashboard");
  const serverLog = createLogger("server");

  // ── 1. Config + DB + Model ──────────────────────────────────────
  const resolvedConfigPath = configPath ?? resolve(ROOT_DIR, "config", "default.yaml");
  const config = loadConfig(resolvedConfigPath);
  setOpenCodeDirectoryDefault(config, ROOT_DIR);
  await disableOpenCodeIfUnavailable(config, modelLog);
  configLog.log(`provider=${config.llm.provider} model=${config.llm.model}`);

  const dbPath = resolve(ROOT_DIR, "agent.db");
  const db = initDatabase(dbPath);
  pushSchema(db);
  dbLog.log(`SQLite initialized at ${dbPath}`);

  const model = await resolveModel(config, {
    onFallback: (event) => {
      const errMsg = event.error instanceof Error ? event.error.message : String(event.error);
      modelLog.warn(
        `Fallback: ${event.failedProvider}/${event.failedModelId} failed ` +
        `(${event.reason}: ${errMsg}), switching to ${event.selectedProvider}/${event.selectedModelId}`,
      );
      if (event.reason === "quota-window") {
        modelLog.warn("Quota/time-window limit detected. Staying on fallback model until limit resets.");
      }
    },
  });
  const fallbackCount = config.llm.fallbackModels?.length ?? 0;
  modelLog.log(`Resolved ${config.llm.provider}/${config.llm.model}` +
    (fallbackCount > 0 ? ` with ${fallbackCount} fallback(s)` : ""));

  let capableModel: LanguageModel | undefined;
  let capablePricing: ModelPricing | undefined;
  if (config.llm.capableModel) {
    const cm = config.llm.capableModel;
    capableModel = await resolveModelWithFallbacks({
      provider: cm.provider,
      model: cm.model,
      apiKey: config.llm.apiKey,
      providers: config.llm.providers,
      fallbackModels: config.llm.capableFallbackModels ?? config.llm.fallbackModels,
      fallbackCooldownMs: config.llm.fallbackCooldownMs,
      fallbackCooldownReasons: config.llm.fallbackCooldownReasons,
      onFallback: (event) => {
        const errMsg = event.error instanceof Error ? event.error.message : String(event.error);
        modelLog.warn(
          `Capable fallback: ${event.failedProvider}/${event.failedModelId} failed ` +
          `(${event.reason}: ${errMsg}), switching to ${event.selectedProvider}/${event.selectedModelId}`,
        );
      },
    });
    if (cm.costPerMInputTokens !== undefined && cm.costPerMOutputTokens !== undefined) {
      capablePricing = { costPerMInputTokens: cm.costPerMInputTokens, costPerMOutputTokens: cm.costPerMOutputTokens };
    }
    modelLog.log(`Capable model: ${cm.provider}/${cm.model}`);
  }

  // ── 2. Infrastructure ──────────────────────────────────────────
  const workspacePath = resolve(ROOT_DIR, "workspace");
  const registry = new ToolRegistry();
  const liveSessionBus = new LiveSessionBus();
  const sessionRepo = new SessionRepository(db);
  const traceRepo = new TraceRepository(db);
  const messageRepo = new MessageRepository(db);

  // Clean up sessions stuck in `pending` from a previous crash or hung model call.
  const staleCount = sessionRepo.markStalePendingAsFailed();
  if (staleCount > 0) {
    serverLog.warn(`Marked ${staleCount} stale pending session(s) as failed on startup`);
  }

  const governancePolicy: GovernancePolicy = {
    read: config.governance?.read ?? "auto-allow",
    write: config.governance?.write ?? "confirm",
    exec: config.governance?.exec ?? "confirm",
    toolOverrides: {
      // Scheduler tools are safe workspace-level operations (JSON file CRUD)
      schedule_task: "auto-allow",
      list_scheduled_tasks: "auto-allow",
      cancel_scheduled_task: "auto-allow",
      ...config.governance?.toolOverrides,
    },
  };
  govLog.log(`read=${governancePolicy.read} write=${governancePolicy.write} exec=${governancePolicy.exec}`);

  // Sandbox check
  const sandboxLevel = config.sandbox?.defaultLevel ?? "loose";
  sandboxLog.log(`defaultLevel=${sandboxLevel}`);
  const needsDocker = sandboxLevel === "strict" ||
    Object.values(config.sandbox?.toolOverrides ?? {}).includes("strict");
  if (needsDocker) {
    const docker = await checkDockerAvailability();
    if (!docker.available) {
      sandboxLog.warn(`strict mode configured but Docker unavailable: ${docker.error}`);
    } else {
      sandboxLog.log(`Docker available: ${docker.version}`);
    }
  }

  // Rate limiters
  const channelLimiter = config.rateLimit?.channel ? new SlidingWindowLimiter(config.rateLimit.channel) : undefined;
  const httpLimiter = config.rateLimit?.http ? new SlidingWindowLimiter(config.rateLimit.http) : undefined;
  const toolLimiter = config.rateLimit?.tool ? new SlidingWindowLimiter(config.rateLimit.tool) : undefined;

  if (config.rateLimit) {
    const parts: string[] = [];
    if (channelLimiter) parts.push(`channel=${config.rateLimit.channel!.maxRequests}/${config.rateLimit.channel!.windowMs}ms`);
    if (httpLimiter) parts.push(`http=${config.rateLimit.http!.maxRequests}/${config.rateLimit.http!.windowMs}ms`);
    if (toolLimiter) parts.push(`tool=${config.rateLimit.tool!.maxRequests}/${config.rateLimit.tool!.windowMs}ms`);
    rateLimitLog.log(parts.join(", "));
  }

  // Pricing
  let livePricing: ModelPricing | undefined;
  if (config.llm.provider === "openrouter") {
    livePricing = await fetchOpenRouterPricing(config.llm.model);
    if (livePricing) {
      pricingLog.log(`${config.llm.model}: $${livePricing.costPerMInputTokens}/M in, $${livePricing.costPerMOutputTokens}/M out`);
    } else {
      pricingLog.warn(`Could not fetch OpenRouter pricing for ${config.llm.model} — falling back to config`);
    }
  }

  memoryLog.log(`Workspace: ${workspacePath} (files loaded fresh per session)`);

  // ── 3. Load plugins ────────────────────────────────────────────
  // Temporary pluginCtx for init phase — getAdapter/getAdapters are patched
  // after loadPlugins() to share the loader's adaptersByPrefix map directly.
  let adaptersByPrefix = new Map<string, ChannelAdapterLike>();

  const pluginCtx: PluginContext = {
    config,
    workspacePath,
    rootDir: ROOT_DIR,
    registerTool: (tool) => registry.register(tool),
    unregisterTool: (name) => registry.unregister(name),
    getAdapter: (prefix) => adaptersByPrefix.get(prefix),
    getAdapters: () => [...adaptersByPrefix.values()],
    log: (msg) => console.log(msg),
    warn: (msg) => console.warn(msg),
  };

  // Built-in tools plugin + auto-resolved channel/service plugins
  const builtInToolsPlugin = createBuiltInToolsPlugin({
    registry,
    configPath: resolvedConfigPath,
    sessionSearchFn: (q, opts) => sessionRepo.searchByKeyword(q, opts),
    listRecentSessionsFn: (opts) => sessionRepo.listRecentCompleted(opts),
  });
  const channelPlugins = await resolvePlugins(config, channelLimiter, {
    listDistinctChannels: () => sessionRepo.listDistinctChannels(),
  });
  const allPlugins = [builtInToolsPlugin, ...channelPlugins];

  const pluginResult = await loadPlugins(allPlugins, pluginCtx);

  // Share the loader's adapter map so handleMessage (and its confirmationDelegate)
  // sees adapters as soon as registerAdapter() is called in afterInit — no race.
  adaptersByPrefix = pluginResult.adaptersByPrefix;

  // Load docs plugin (needs collected docs from other plugins)
  {
    const { createDocsPlugin } = await import("@baseagent/plugin-docs");
    const docsPlugin = createDocsPlugin(pluginResult.docs, ROOT_DIR);
    const docsCaps = await docsPlugin.init(pluginCtx);
    if (docsCaps) {
      if (docsCaps.routes) {
        pluginResult.routes.push({
          app: docsCaps.routes as Hono,
          prefix: docsCaps.routePrefix ?? "/docs-plugin",
        });
      }
      if (docsCaps.dashboardTabs) {
        pluginResult.dashboardTabs.push(...docsCaps.dashboardTabs);
      }
    }
  }

  // ── 4. Session deps + handleMessage ────────────────────────────
  const sessionDeps: RunSessionDeps = {
    model, registry, config, workspacePath,
    sessionRepo, traceRepo, messageRepo,
    governancePolicy,
    toolRateLimiter: toolLimiter,
    pricing: livePricing,
    liveSessionBus,
    capableModel, capablePricing,
  };

  function createConfirmationDelegateForChannel(channelId: string): ConfirmationDelegate | undefined {
    const prefix = channelId.split(":")[0];
    const adapter = adaptersByPrefix.get(prefix);
    if (!adapter?.requestConfirmation) return undefined;
    return async (toolName, permission, args) => {
      const argSummary = Object.entries(args)
        .map(([k, v]) => `  ${k}: ${typeof v === "string" && v.length > 80 ? v.slice(0, 80) + "..." : String(v)}`)
        .join("\n");
      const prompt = `[Governance] Tool "${toolName}" (${permission}) requests approval.\n\n${argSummary}\n\nReply YES to approve or NO to deny.`;
      const result = await adapter.requestConfirmation!(
        channelId,
        prompt,
        config.governance?.confirmationTimeoutMs,
      );
      return result.approved
        ? { approved: true as const }
        : { approved: false as const, reason: result.reason ?? "User denied" };
    };
  }

  const handleMessage: HandleMessageFn = async (message, stream) => {
    const emitter = new LoopEmitter();
    let activeSessionId: string | undefined;
    let sawProgressSignal = false;
    const markProgress = () => {
      sawProgressSignal = true;
    };

    emitter.on("text_delta", (delta) => {
      markProgress();
      stream.onTextDelta(delta);
    });
    emitter.on("text_reset", () => stream.onTextReset?.());
    emitter.on("tool_call", (call) => {
      markProgress();
      stream.onToolCall(call.toolName);
    });
    emitter.on("tool_result", (result) => {
      stream.onToolResult?.(result.toolName, !result.error, result.error);
    });
    emitter.on("error", (error) => stream.onError(error));
    emitter.on("trace", (event) => {
      if (event.phase === "session_start" && event.sessionId) {
        activeSessionId = event.sessionId;
        stream.onSessionStart?.(event.sessionId);
      }
    });

    let progressTick = 0;
    const progressTimer = setInterval(() => {
      if (sawProgressSignal) return;
      progressTick += 1;
      if (progressTick === 1) {
        stream.onToolCall("thinking");
      } else {
        stream.onToolCall(`working (step ${progressTick})`);
      }
    }, 12_000);

    try {
      const tokenBudget = config.llm.conversationHistoryTokenBudget ?? config.memory.conversationHistoryTokenBudget;
      const conversationHistory = message.channelId
        ? buildConversationHistory(sessionRepo.findRecentByChannelId(message.channelId), tokenBudget)
        : undefined;

      const confirmationDelegate = createConfirmationDelegateForChannel(message.channelId);
      const result = await runSession(
        { input: message.text, channelId: message.channelId, conversationHistory },
        { ...sessionDeps, confirmationDelegate },
        emitter,
      );
      clearInterval(progressTimer);
      stream.onFinish(result.output, { sessionId: result.sessionId ?? activeSessionId });
    } catch (err) {
      clearInterval(progressTimer);
      const error = err instanceof Error ? err : new Error(String(err));
      stream.onError(error);
    }
  };

  const queuedHandleMessage = createQueuedHandler(handleMessage);

  // ── 5. Plugin afterInit (wires adapters with handleMessage) ────
  // Build session runner factory for plugins (auto-allow governance, no confirmation)
  const createPluginSessionRunner = () => {
    const pluginDeps: RunSessionDeps = {
      ...sessionDeps,
      governancePolicy: { read: "auto-allow", write: "auto-allow", exec: "auto-allow" },
      confirmationDelegate: undefined,
    };
    return async (input: { input: string; channelId?: string }) => {
      const result = await runSession(input, pluginDeps);
      return { sessionId: result.sessionId, output: result.output };
    };
  };

  // Build a lazy proactive message sender.
  // Adapters register during afterInit, so we resolve them on first call
  // rather than eagerly (which would see an empty adapter list).
  let resolvedSendFn: ((channelId: string, text: string) => Promise<void>) | null | undefined;
  const lazySendProactiveMessage = async (channelId: string, text: string): Promise<void> => {
    if (resolvedSendFn === undefined) {
      const adapters = pluginCtx.getAdapters();
      const proactiveAdapters = adapters
        .filter((a): a is ChannelAdapterLike & { sendMessage: (id: string, text: string) => Promise<void> } =>
          typeof a.sendMessage === "function",
        )
        .map((a) => ({ name: a.name, sendMessage: a.sendMessage.bind(a) }));
      resolvedSendFn = proactiveAdapters.length > 0
        ? createProactiveMessenger(proactiveAdapters)
        : null;
    }
    if (resolvedSendFn) {
      await resolvedSendFn(channelId, text);
    } else {
      serverLog.warn(`[proactive] No adapter available for delivery to ${channelId}`);
    }
  };

  await pluginResult.afterInit(handleMessage, queuedHandleMessage, {
    createSessionRunner: createPluginSessionRunner,
    sendProactiveMessage: lazySendProactiveMessage,
  });

  // adaptersByPrefix now points to the loader's map — adapters registered
  // during afterInit are visible immediately to handleMessage/confirmationDelegate.

  // ── 7. Build Hono app ──────────────────────────────────────────
  const app = new Hono();
  app.route("/", healthRoute);

  // Dashboard
  const reloadSkills = createSkillReloader(pluginCtx, registry);
  const dashboardApi = createDashboardApi({
    sessionRepo,
    traceRepo,
    workspacePath,
    liveSessionBus,
    dashboardSecret: config.dashboard?.secret,
    reloadSkills,
    getModelStatus: () => {
      const runtimeChain = getFallbackModelStatus(model);
      const capableChain = capableModel ? getFallbackModelStatus(capableModel) : undefined;
      const primaryChain = runtimeChain ?? [
        {
          index: 0,
          provider: config.llm.provider,
          modelId: config.llm.model,
          inCooldown: false,
          cooldownUntil: null,
          cooldownRemainingMs: 0,
        },
      ];
      const capableChainResolved = capableChain ?? (config.llm.capableModel ? [
        {
          index: 0,
          provider: config.llm.capableModel.provider,
          modelId: config.llm.capableModel.model,
          inCooldown: false,
          cooldownUntil: null,
          cooldownRemainingMs: 0,
        },
      ] : undefined);
      return {
        chain: primaryChain,
        capableChain: capableChainResolved,
        fallbackCooldownMs: config.llm.fallbackCooldownMs,
        fallbackCooldownReasons: config.llm.fallbackCooldownReasons,
      };
    },
  });
  app.route("/", dashboardApi);

  const botName = parseBotName(workspacePath);
  const dashboardHtml = injectPluginTabs(
    readFileSync(resolve(__dirname, "dashboard", "index.html"), "utf-8"),
    pluginResult.dashboardTabs,
  ).replace(/__BOT_NAME__/g, botName);
  app.get("/dashboard", (c) => c.html(dashboardHtml));
  app.get("/favicon.ico", (c) => c.body(null, 204));
  dashboardLog.log(`Trace replay UI at GET /dashboard (${pluginResult.dashboardTabs.length} plugin tab(s))`);

  // HTTP rate limiting
  if (httpLimiter) {
    const httpRateLimitMw = createRateLimitMiddleware(httpLimiter);
    app.use("/run", httpRateLimitMw);
    app.use("/resume", httpRateLimitMw);
  }

  // POST /run
  app.post("/run", async (c) => {
    const body = await c.req.json<{ input: string; channelId?: string }>();
    if (!body.input || typeof body.input !== "string") {
      return c.json({ error: "Missing 'input' field" }, 400);
    }
    try {
      const result = await runSession({ input: body.input, channelId: body.channelId }, sessionDeps);
      return c.json({
        sessionId: result.sessionId, output: result.output,
        usage: {
          totalTokens: result.state.totalTokens, promptTokens: result.state.promptTokens,
          completionTokens: result.state.completionTokens, estimatedCostUsd: result.state.estimatedCostUsd,
          iterations: result.state.iteration,
        },
        status: result.state.status,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      serverLog.error(`Session failed: ${err}`);
      return c.json({ error: message }, 500);
    }
  });

  // POST /resume
  const RESUMABLE_STATUSES = new Set(["timeout", "cost_limit", "failed", "pending"]);
  app.post("/resume", async (c) => {
    const body = await c.req.json<{
      sessionId: string; input?: string; additionalBudgetUsd?: number; additionalIterations?: number;
    }>();
    if (!body.sessionId || typeof body.sessionId !== "string") {
      return c.json({ error: "Missing 'sessionId' field" }, 400);
    }
    const session = sessionRepo.findById(body.sessionId);
    if (!session) return c.json({ error: "Session not found" }, 404);
    if (!RESUMABLE_STATUSES.has(session.status)) {
      return c.json({ error: `Session status '${session.status}' is not resumable` }, 409);
    }
    const rows = messageRepo.loadSessionMessages(body.sessionId);
    const hasStoredMessages = rows.length > 0;
    const deserialized = hasStoredMessages ? deserializeMessages(rows) : undefined;
    const restoredMessages = deserialized?.messages ?? [];
    const toolMessageMeta = deserialized?.toolMessageMeta;
    if (hasStoredMessages && body.input) restoredMessages.push({ role: "user", content: body.input });
    const initialState: Partial<LoopState> = {
      iteration: session.iterations, totalTokens: session.totalTokens,
      promptTokens: session.promptTokens, completionTokens: session.completionTokens,
      estimatedCostUsd: session.totalCostUsd,
    };
    const effectiveCostCap = (initialState.estimatedCostUsd ?? 0) + (body.additionalBudgetUsd ?? config.agent.costCapUsd);
    const effectiveMaxIterations = (initialState.iteration ?? 0) + (body.additionalIterations ?? config.agent.maxIterations);
    try {
      const resumeInput = hasStoredMessages
        ? (body.input ?? "")
        : (body.input ?? session.input ?? "");
      const result = await runSession({
        input: resumeInput,
        channelId: session.channelId ?? undefined,
        sessionId: body.sessionId,
        initialMessages: hasStoredMessages ? restoredMessages as CoreMessage[] : undefined,
        initialToolMessageMeta: hasStoredMessages ? toolMessageMeta : undefined,
        initialState,
        costCapOverrideUsd: effectiveCostCap,
        maxIterationsOverride: effectiveMaxIterations,
      }, sessionDeps);
      return c.json({
        resumed: true, sessionId: body.sessionId, output: result.output,
        resumedFromEmptyMessages: !hasStoredMessages,
        usage: {
          totalTokens: result.state.totalTokens, promptTokens: result.state.promptTokens,
          completionTokens: result.state.completionTokens, estimatedCostUsd: result.state.estimatedCostUsd,
          iterations: result.state.iteration,
        },
        status: result.state.status,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      serverLog.error(`Resume failed: ${err}`);
      return c.json({ error: message }, 500);
    }
  });

  // Mount plugin routes (includes webhook if enabled)
  for (const route of pluginResult.routes) {
    app.route(route.prefix, route.app);
  }

  // ── 8. Shutdown ────────────────────────────────────────────────
  const shutdown = async () => {
    serverLog.log("Shutting down...");
    await pluginResult.shutdown();
    process.exit(0);
  };

  return { config, workspacePath, registry, sessionDeps, liveSessionBus, app, shutdown };
}
