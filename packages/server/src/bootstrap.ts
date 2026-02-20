import { Hono } from "hono";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..", "..", "..");

import {
  loadConfig,
  resolveModel,
  resolveSingleModel,
  LoopEmitter,
  fetchOpenRouterPricing,
  createLogger,
  type AppConfig,
  type CoreMessage,
  type DashboardTab,
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
import { createHeartbeatScheduler, type HeartbeatScheduler } from "./heartbeat.js";
import { createTaskScheduler, type TaskScheduler } from "./scheduler.js";
import { createTaskStoreFromWorkspace } from "@baseagent/plugin-scheduler";
import { createWebhookRoute } from "./webhook.js";
import { createDashboardApi } from "./dashboard-api.js";
import { SlidingWindowLimiter, createRateLimitMiddleware } from "./rate-limit.js";
import { loadPlugins } from "./plugins/plugin-loader.js";
import { resolvePlugins } from "./plugins/resolve-plugins.js";
import { createBuiltInToolsPlugin } from "./plugins/built-in-tools.plugin.js";
import type { LoopState } from "@baseagent/core";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildConversationHistory(
  sessions: Array<{ input: string; output: string | null }>,
  tokenBudget: number,
): CoreMessage[] | undefined {
  const selected: Array<{ input: string; output: string }> = [];
  let tokensUsed = 0;

  for (const s of sessions) {
    if (!s.output) continue;
    const turnTokens = Math.ceil((s.input.length + s.output.length) / 4);
    if (tokensUsed + turnTokens > tokenBudget) break;
    selected.push({ input: s.input, output: s.output });
    tokensUsed += turnTokens;
  }

  if (selected.length === 0) return undefined;

  const messages: CoreMessage[] = [];
  for (const s of selected.reverse()) {
    messages.push({ role: "user", content: s.input });
    messages.push({ role: "assistant", content: s.output });
  }
  return messages;
}

/**
 * Inject plugin-contributed dashboard tabs into the HTML template.
 * Replaces placeholders with tab buttons, CSS, panel HTML, JS, and keyboard shortcuts.
 */
function injectPluginTabs(html: string, tabs: DashboardTab[]): string {
  if (tabs.length === 0) return html
    .replace("<!-- __PLUGIN_TAB_BUTTONS__ -->", "")
    .replace("<!-- __PLUGIN_PANELS__ -->", "")
    .replace("/* __PLUGIN_CSS__ */", "")
    .replace("// __PLUGIN_JS__", "")
    .replace("// __PLUGIN_KEYBOARD_SHORTCUTS__", "");

  const NEXT_KEY = 5; // Built-in tabs use 1-4

  const tabButtons = tabs.map((t) =>
    `<button class="tab-btn" data-tab="${t.id}" onclick="switchTab('${t.id}')">${t.label}</button>`,
  ).join("\n    ");

  const panelHtml = tabs.map((t) => t.panelHtml).join("\n");

  const css = tabs
    .map((t) => {
      // Auto-generate default-hidden + full-width + show rule, then append custom CSS
      const base = `.${t.id}-panel { display: none; grid-column: 1 / -1; }\n` +
        `.layout.tab-${t.id} .${t.id}-panel { display: flex; }`;
      return t.css ? `${base}\n${t.css}` : base;
    })
    .join("\n");

  const js = tabs.map((t) => {
    const parts: string[] = [];
    // Register the one-shot activator
    if (t.onActivate) {
      parts.push(`_pluginTabActivated['${t.id}'] = false;`);
      parts.push(`window['_pluginActivate_${t.id}'] = function() { ${t.onActivate} };`);
    }
    if (t.js) parts.push(t.js);
    return parts.join("\n");
  }).join("\n\n");

  const keyboardShortcuts = tabs
    .filter((_, i) => NEXT_KEY + i <= 9) // Only single-digit keys (5-9)
    .map((t, i) =>
      `  else if (e.key === '${NEXT_KEY + i}') switchTab('${t.id}');`,
    ).join("\n");

  return html
    .replace("<!-- __PLUGIN_TAB_BUTTONS__ -->", tabButtons)
    .replace("<!-- __PLUGIN_PANELS__ -->", panelHtml)
    .replace("/* __PLUGIN_CSS__ */", css)
    .replace("// __PLUGIN_JS__", js)
    .replace("// __PLUGIN_KEYBOARD_SHORTCUTS__", keyboardShortcuts);
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
  const webhookLog = createLogger("webhook");
  const serverLog = createLogger("server");

  // ── 1. Config + DB + Model ──────────────────────────────────────
  const resolvedConfigPath = configPath ?? resolve(ROOT_DIR, "config", "default.yaml");
  const config = loadConfig(resolvedConfigPath);
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
        `(${errMsg}), switching to ${event.selectedProvider}/${event.selectedModelId}`,
      );
    },
  });
  const fallbackCount = config.llm.fallbackModels?.length ?? 0;
  modelLog.log(`Resolved ${config.llm.provider}/${config.llm.model}` +
    (fallbackCount > 0 ? ` with ${fallbackCount} fallback(s)` : ""));

  let capableModel: LanguageModel | undefined;
  let capablePricing: ModelPricing | undefined;
  if (config.llm.capableModel) {
    const cm = config.llm.capableModel;
    capableModel = await resolveSingleModel({
      provider: cm.provider, model: cm.model,
      apiKey: config.llm.apiKey, providers: config.llm.providers,
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
  const builtInToolsPlugin = createBuiltInToolsPlugin({ registry, configPath: resolvedConfigPath });
  const channelPlugins = await resolvePlugins(config, channelLimiter);
  const allPlugins = [builtInToolsPlugin, ...channelPlugins];

  const pluginResult = await loadPlugins(allPlugins, pluginCtx);

  // Share the loader's adapter map so handleMessage (and its confirmationDelegate)
  // sees adapters as soon as registerAdapter() is called in afterInit — no race.
  adaptersByPrefix = pluginResult.adaptersByPrefix;

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
      const result = await adapter.requestConfirmation!(channelId, prompt);
      return result.approved
        ? { approved: true as const }
        : { approved: false as const, reason: result.reason ?? "User denied" };
    };
  }

  const handleMessage: HandleMessageFn = async (message, stream) => {
    const emitter = new LoopEmitter();
    emitter.on("text_delta", (delta) => stream.onTextDelta(delta));
    emitter.on("text_reset", () => stream.onTextReset?.());
    emitter.on("tool_call", (call) => stream.onToolCall(call.toolName));
    emitter.on("error", (error) => stream.onError(error));

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
      stream.onFinish(result.output);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      stream.onError(error);
    }
  };

  const queuedHandleMessage = createQueuedHandler(handleMessage);

  // ── 5. Plugin afterInit (wires adapters with handleMessage) ────
  await pluginResult.afterInit(handleMessage, queuedHandleMessage);

  // adaptersByPrefix now points to the loader's map — adapters registered
  // during afterInit are visible immediately to handleMessage/confirmationDelegate.

  // ── 6. Heartbeat ───────────────────────────────────────────────
  let heartbeat: HeartbeatScheduler | null = null;

  if (config.heartbeat?.enabled) {
    const adapters = pluginCtx.getAdapters();
    const proactiveAdapters = adapters
      .filter((a): a is ChannelAdapterLike & { sendMessage: (id: string, text: string) => Promise<void> } =>
        typeof a.sendMessage === "function",
      )
      .map((a) => ({ name: a.name, sendMessage: a.sendMessage.bind(a) }));

    const sendProactiveMessage = proactiveAdapters.length > 0
      ? createProactiveMessenger(proactiveAdapters)
      : undefined;

    const heartbeatDeps: RunSessionDeps = {
      ...sessionDeps,
      governancePolicy: { read: "auto-allow", write: "auto-allow", exec: "auto-allow" },
      confirmationDelegate: undefined,
    };

    heartbeat = createHeartbeatScheduler({ config, sessionDeps: heartbeatDeps, workspacePath, sendProactiveMessage });
    heartbeat.start();
  }

  // ── 6b. Task Scheduler ─────────────────────────────────────────
  let taskScheduler: TaskScheduler | null = null;
  {
    const adapters = pluginCtx.getAdapters();
    const proactiveAdapters = adapters
      .filter((a): a is ChannelAdapterLike & { sendMessage: (id: string, text: string) => Promise<void> } =>
        typeof a.sendMessage === "function",
      )
      .map((a) => ({ name: a.name, sendMessage: a.sendMessage.bind(a) }));

    const sendProactive = proactiveAdapters.length > 0
      ? createProactiveMessenger(proactiveAdapters)
      : undefined;

    const schedulerDeps: RunSessionDeps = {
      ...sessionDeps,
      governancePolicy: { read: "auto-allow", write: "auto-allow", exec: "auto-allow" },
      confirmationDelegate: undefined,
    };

    const store = createTaskStoreFromWorkspace(workspacePath);
    taskScheduler = createTaskScheduler({
      store,
      sessionDeps: schedulerDeps,
      sendProactiveMessage: sendProactive,
    });
    taskScheduler.start();
  }

  // ── 7. Build Hono app ──────────────────────────────────────────
  const app = new Hono();
  app.route("/", healthRoute);

  // Dashboard
  const dashboardApi = createDashboardApi({ sessionRepo, traceRepo, workspacePath, liveSessionBus });
  app.route("/", dashboardApi);

  const botName = parseBotName(workspacePath);
  const dashboardHtml = injectPluginTabs(
    readFileSync(resolve(__dirname, "dashboard", "index.html"), "utf-8"),
    pluginResult.dashboardTabs,
  ).replace(/__BOT_NAME__/g, botName);
  app.get("/dashboard", (c) => c.html(dashboardHtml));
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
  const RESUMABLE_STATUSES = new Set(["timeout", "cost_limit", "failed"]);
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
    if (rows.length === 0) return c.json({ error: "No messages found for session" }, 404);
    const { messages: restoredMessages, toolMessageMeta } = deserializeMessages(rows);
    if (body.input) restoredMessages.push({ role: "user", content: body.input });
    const initialState: Partial<LoopState> = {
      iteration: session.iterations, totalTokens: session.totalTokens,
      promptTokens: session.promptTokens, completionTokens: session.completionTokens,
      estimatedCostUsd: session.totalCostUsd,
    };
    const effectiveCostCap = (initialState.estimatedCostUsd ?? 0) + (body.additionalBudgetUsd ?? config.agent.costCapUsd);
    const effectiveMaxIterations = (initialState.iteration ?? 0) + (body.additionalIterations ?? config.agent.maxIterations);
    try {
      const result = await runSession({
        input: body.input ?? "", sessionId: body.sessionId, initialMessages: restoredMessages,
        initialToolMessageMeta: toolMessageMeta, initialState,
        costCapOverrideUsd: effectiveCostCap, maxIterationsOverride: effectiveMaxIterations,
      }, sessionDeps);
      return c.json({
        resumed: true, sessionId: body.sessionId, output: result.output,
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

  // Webhook route (if enabled)
  if (config.webhook?.enabled !== false) {
    const adapters = pluginCtx.getAdapters();
    const proactiveAdapters = adapters
      .filter((a): a is ChannelAdapterLike & { sendMessage: (id: string, text: string) => Promise<void> } =>
        typeof a.sendMessage === "function",
      )
      .map((a) => ({ name: a.name, sendMessage: a.sendMessage.bind(a) }));

    const sendProactiveMessage = proactiveAdapters.length > 0
      ? createProactiveMessenger(proactiveAdapters)
      : undefined;

    const webhookSessionDeps: RunSessionDeps = {
      ...sessionDeps,
      governancePolicy: { read: "auto-allow", write: "auto-allow", exec: "auto-allow" },
      confirmationDelegate: undefined,
    };

    const webhookApp = createWebhookRoute({ config, sessionDeps: webhookSessionDeps, sendProactiveMessage });
    if (httpLimiter) {
      app.use("/webhook/*", createRateLimitMiddleware(httpLimiter));
    }
    app.route("/", webhookApp);
    webhookLog.log(`Endpoint enabled at POST /webhook/:event` +
      (config.webhook?.secret ? " (signature verification on)" : "") +
      (config.webhook?.resultChannelId ? ` → results to ${config.webhook.resultChannelId}` : ""));
  }

  // Mount plugin routes
  for (const route of pluginResult.routes) {
    app.route(route.prefix, route.app);
  }

  // ── 8. Shutdown ────────────────────────────────────────────────
  const shutdown = async () => {
    serverLog.log("Shutting down...");
    heartbeat?.stop();
    taskScheduler?.stop();
    await pluginResult.shutdown();
    process.exit(0);
  };

  return { config, workspacePath, registry, sessionDeps, liveSessionBus, app, shutdown };
}
