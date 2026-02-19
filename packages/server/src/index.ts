import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// packages/server/src → repo root
const ROOT_DIR = resolve(__dirname, "..", "..", "..");

import {
  loadConfig,
  resolveModel,
  LoopEmitter,
  fetchOpenRouterPricing,
  type LoopState,
  type CoreMessage,
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
  finishTool,
  thinkTool,
  createAddMcpServerTool,
  createMemoryReadTool,
  createMemoryWriteTool,
  createFileReadTool,
  createFileWriteTool,
  createFileEditTool,
  createFileListTool,
  createShellExecTool,
  createWebFetchTool,
  loadSkills,
  loadMcpServers,
  closeMcpServers,
  checkDockerAvailability,
  type GovernancePolicy,
  type ConfirmationDelegate,
  type McpServerHandle,
} from "@baseagent/tools";
import {
  TelegramAdapter,
  DiscordAdapter,
  SlackAdapter,
  createQueuedHandler,
  createProactiveMessenger,
  type HandleMessageFn,
  type ChannelAdapter,
} from "@baseagent/gateway";

import { healthRoute } from "./health.js";
import { LiveSessionBus } from "./live-stream.js";
import { runSession, type RunSessionDeps } from "./run-session.js";
import { createHeartbeatScheduler, type HeartbeatScheduler } from "./heartbeat.js";
import { createWebhookRoute } from "./webhook.js";
import { createDashboardApi } from "./dashboard-api.js";
import { SlidingWindowLimiter, createRateLimitMiddleware } from "./rate-limit.js";

/**
 * Build conversation history from recent sessions, bounded by a token budget.
 * Sessions arrive newest-first from the DB; we greedily include the most recent
 * exchanges that fit, then reverse to chronological order for injection.
 */
function buildConversationHistory(
  sessions: Array<{ input: string; output: string | null }>,
  tokenBudget: number,
): CoreMessage[] | undefined {
  const selected: Array<{ input: string; output: string }> = [];
  let tokensUsed = 0;

  for (const s of sessions) { // newest first
    if (!s.output) continue;
    const turnTokens = Math.ceil((s.input.length + s.output.length) / 4);
    if (tokensUsed + turnTokens > tokenBudget) break;
    selected.push({ input: s.input, output: s.output });
    tokensUsed += turnTokens;
  }

  if (selected.length === 0) return undefined;

  const messages: CoreMessage[] = [];
  for (const s of selected.reverse()) { // oldest first
    messages.push({ role: "user", content: s.input });
    messages.push({ role: "assistant", content: s.output });
  }
  return messages;
}

async function main() {
  // 1. Load config
  const configPath = resolve(ROOT_DIR, "config", "default.yaml");
  const config = loadConfig(configPath);
  console.log(`[config] provider=${config.llm.provider} model=${config.llm.model}`);

  // 2. Init database + push schema
  const dbPath = resolve(ROOT_DIR, "agent.db");
  const db = initDatabase(dbPath);
  pushSchema(db);
  console.log(`[db] SQLite initialized at ${dbPath}`);

  // 3. Resolve LLM model (with optional fallback chain)
  const model = await resolveModel(config, {
    onFallback: (event) => {
      console.warn(
        `[model] Fallback: ${event.failedProvider}/${event.failedModelId} failed, ` +
        `switching to ${event.selectedProvider}/${event.selectedModelId}`
      );
    },
  });
  const fallbackCount = config.llm.fallbackModels?.length ?? 0;
  console.log(`[model] Resolved ${config.llm.provider}/${config.llm.model}` +
    (fallbackCount > 0 ? ` with ${fallbackCount} fallback(s)` : ""));

  // 4. Register built-in tools
  const workspacePath = resolve(ROOT_DIR, "workspace");
  const registry = new ToolRegistry();
  registry.register(finishTool);
  registry.register(thinkTool);
  registry.register(createMemoryReadTool(workspacePath));
  registry.register(createMemoryWriteTool(workspacePath));
  registry.register(createFileReadTool(workspacePath));
  registry.register(createFileWriteTool(workspacePath));
  registry.register(createFileEditTool(workspacePath));
  registry.register(createFileListTool(workspacePath));
  registry.register(createShellExecTool(workspacePath));
  registry.register(createWebFetchTool());
  console.log(`[tools] Built-in: ${registry.names().join(", ")}`);

  // 4b. Load skills from skills/ directory
  const skillsDir = resolve(ROOT_DIR, "skills");
  const skillResult = await loadSkills(skillsDir, { workspacePath });
  for (const tool of skillResult.tools) {
    registry.register(tool);
  }
  if (skillResult.loaded.length > 0) {
    console.log(`[skills] Loaded: ${skillResult.loaded.join(", ")}`);
  }
  if (skillResult.failed.length > 0) {
    for (const f of skillResult.failed) {
      console.warn(`[skills] Failed to load "${f.name}": ${f.error}`);
    }
  }

  // 4c. Load MCP servers
  const mcpHandles: McpServerHandle[] = [];
  if (config.mcp?.servers?.length) {
    const mcpResult = await loadMcpServers(config.mcp.servers);
    for (const handle of mcpResult.handles) {
      for (const tool of handle.tools) {
        registry.register(tool);
      }
      mcpHandles.push(handle);
    }
    if (mcpResult.loaded.length > 0) {
      console.log(`[mcp] Connected: ${mcpResult.loaded.join(", ")}`);
      const toolNames = mcpHandles.flatMap((h) => h.tools.map((t) => t.name));
      console.log(`[mcp] Tools registered: ${toolNames.join(", ")}`);
    }
    for (const f of mcpResult.failed) {
      console.warn(`[mcp] Failed "${f.name}": ${f.error}`);
    }
  }

  // 4d. Register add_mcp_server — wired to the live registry + handles
  registry.register(createAddMcpServerTool({ registry, mcpHandles, configPath }));

  // 5. Memory files are loaded fresh per-session (hot-reload, MM-5).
  console.log(`[memory] Workspace: ${workspacePath} (files loaded fresh per session)`);

  // 6. Create repositories
  const sessionRepo = new SessionRepository(db);
  const traceRepo = new TraceRepository(db);
  const messageRepo = new MessageRepository(db);

  // 6b. Parse governance policy from config
  const governancePolicy: GovernancePolicy = {
    read: config.governance?.read ?? "auto-allow",
    write: config.governance?.write ?? "confirm",
    exec: config.governance?.exec ?? "confirm",
    toolOverrides: config.governance?.toolOverrides,
  };
  console.log(`[governance] read=${governancePolicy.read} write=${governancePolicy.write} exec=${governancePolicy.exec}`);

  // 6b-ii. Sandbox startup check
  const sandboxLevel = config.sandbox?.defaultLevel ?? "loose";
  console.log(`[sandbox] defaultLevel=${sandboxLevel}`);

  const needsDocker =
    sandboxLevel === "strict" ||
    Object.values(config.sandbox?.toolOverrides ?? {}).includes("strict");

  if (needsDocker) {
    const docker = await checkDockerAvailability();
    if (!docker.available) {
      console.warn(`[sandbox] strict mode configured but Docker unavailable: ${docker.error}`);
    } else {
      console.log(`[sandbox] Docker available: ${docker.version}`);
    }
  }

  // 6c. Create rate limiters from config
  const channelLimiter = config.rateLimit?.channel
    ? new SlidingWindowLimiter(config.rateLimit.channel)
    : undefined;
  const httpLimiter = config.rateLimit?.http
    ? new SlidingWindowLimiter(config.rateLimit.http)
    : undefined;
  const toolLimiter = config.rateLimit?.tool
    ? new SlidingWindowLimiter(config.rateLimit.tool)
    : undefined;

  if (config.rateLimit) {
    const parts: string[] = [];
    if (channelLimiter) parts.push(`channel=${config.rateLimit.channel!.maxRequests}/${config.rateLimit.channel!.windowMs}ms`);
    if (httpLimiter) parts.push(`http=${config.rateLimit.http!.maxRequests}/${config.rateLimit.http!.windowMs}ms`);
    if (toolLimiter) parts.push(`tool=${config.rateLimit.tool!.maxRequests}/${config.rateLimit.tool!.windowMs}ms`);
    console.log(`[rate-limit] ${parts.join(", ")}`);
  }

  // 6d. Fetch live model pricing (OpenRouter only — non-fatal if unavailable)
  let livePricing = undefined;
  if (config.llm.provider === "openrouter") {
    livePricing = await fetchOpenRouterPricing(config.llm.model);
    if (livePricing) {
      console.log(`[pricing] ${config.llm.model}: $${livePricing.costPerMInputTokens}/M in, $${livePricing.costPerMOutputTokens}/M out`);
    } else {
      console.warn(`[pricing] Could not fetch OpenRouter pricing for ${config.llm.model} — falling back to config`);
    }
  }

  // 7a. Live session bus (UI-2) — must be created before sessionDeps
  const liveSessionBus = new LiveSessionBus();

  // Shared deps for runSession
  const sessionDeps: RunSessionDeps = {
    model,
    registry,
    config,
    workspacePath,
    sessionRepo,
    traceRepo,
    messageRepo,
    governancePolicy,
    toolRateLimiter: toolLimiter,
    pricing: livePricing,
    liveSessionBus,
  };

  // 7. Build Hono app
  const app = new Hono();
  app.route("/", healthRoute);

  // 7b. Dashboard API + static UI
  const dashboardApi = createDashboardApi({ sessionRepo, traceRepo, workspacePath, liveSessionBus });
  app.route("/", dashboardApi);

  const botName = parseBotName(workspacePath);
  const dashboardHtml = readFileSync(resolve(__dirname, "dashboard", "index.html"), "utf-8")
    .replace(/__BOT_NAME__/g, botName);
  app.get("/dashboard", (c) => {
    return c.html(dashboardHtml);
  });
  console.log("[dashboard] Trace replay UI at GET /dashboard");

  // Apply HTTP rate limiting to /run and /resume
  if (httpLimiter) {
    const httpRateLimitMw = createRateLimitMiddleware(httpLimiter);
    app.use("/run", httpRateLimitMw);
    app.use("/resume", httpRateLimitMw);
  }

  // POST /run — start a new agent session
  app.post("/run", async (c) => {
    const body = await c.req.json<{ input: string; channelId?: string }>();

    if (!body.input || typeof body.input !== "string") {
      return c.json({ error: "Missing 'input' field" }, 400);
    }

    try {
      const result = await runSession({ input: body.input, channelId: body.channelId }, sessionDeps);

      return c.json({
        sessionId: result.sessionId,
        output: result.output,
        usage: {
          totalTokens: result.state.totalTokens,
          promptTokens: result.state.promptTokens,
          completionTokens: result.state.completionTokens,
          estimatedCostUsd: result.state.estimatedCostUsd,
          iterations: result.state.iteration,
        },
        status: result.state.status,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error("[run] Session failed:", err);
      return c.json({ error: message }, 500);
    }
  });

  // POST /resume — continue an interrupted session
  const RESUMABLE_STATUSES = new Set(["timeout", "cost_limit", "failed"]);

  app.post("/resume", async (c) => {
    const body = await c.req.json<{
      sessionId: string;
      input?: string;
      additionalBudgetUsd?: number;
      additionalIterations?: number;
    }>();

    if (!body.sessionId || typeof body.sessionId !== "string") {
      return c.json({ error: "Missing 'sessionId' field" }, 400);
    }

    // 1. Load session
    const session = sessionRepo.findById(body.sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    // 2. Validate resumable status
    if (!RESUMABLE_STATUSES.has(session.status)) {
      return c.json(
        { error: `Session status '${session.status}' is not resumable` },
        409,
      );
    }

    // 3. Load and deserialize messages
    const rows = messageRepo.loadSessionMessages(body.sessionId);
    if (rows.length === 0) {
      return c.json({ error: "No messages found for session" }, 404);
    }

    const { messages: restoredMessages, toolMessageMeta } =
      deserializeMessages(rows);

    // 4. Append new user input if provided
    if (body.input) {
      restoredMessages.push({ role: "user", content: body.input });
    }

    // 5. Reconstruct initial state from session row
    const initialState: Partial<LoopState> = {
      iteration: session.iterations,
      totalTokens: session.totalTokens,
      promptTokens: session.promptTokens,
      completionTokens: session.completionTokens,
      estimatedCostUsd: session.totalCostUsd,
    };

    // 6. Compute effective caps: accumulated + additional budget
    const additionalBudget = body.additionalBudgetUsd ?? config.agent.costCapUsd;
    const effectiveCostCap = (initialState.estimatedCostUsd ?? 0) + additionalBudget;

    const additionalIterations = body.additionalIterations ?? config.agent.maxIterations;
    const effectiveMaxIterations = (initialState.iteration ?? 0) + additionalIterations;

    // 7. Run session with resume inputs
    try {
      const result = await runSession({
        input: body.input ?? "",
        sessionId: body.sessionId,
        initialMessages: restoredMessages,
        initialToolMessageMeta: toolMessageMeta,
        initialState,
        costCapOverrideUsd: effectiveCostCap,
        maxIterationsOverride: effectiveMaxIterations,
      }, sessionDeps);

      return c.json({
        resumed: true,
        sessionId: body.sessionId,
        output: result.output,
        usage: {
          totalTokens: result.state.totalTokens,
          promptTokens: result.state.promptTokens,
          completionTokens: result.state.completionTokens,
          estimatedCostUsd: result.state.estimatedCostUsd,
          iterations: result.state.iteration,
        },
        status: result.state.status,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error("[resume] Session failed:", err);
      return c.json({ error: message }, 500);
    }
  });

  // 8. Start server
  const port = config.server.port;
  const host = config.server.host;

  serve({ fetch: app.fetch, port, hostname: host }, (info) => {
    console.log(`[server] ${botName} listening on http://${host}:${info.port}`);
  });

  // 9. Channel adapters
  const adapters: ChannelAdapter[] = [];
  const adaptersByPrefix = new Map<string, ChannelAdapter>();

  /** Build a confirmation delegate that routes to the right adapter for this channelId. */
  function createConfirmationDelegateForChannel(channelId: string): ConfirmationDelegate | undefined {
    const prefix = channelId.split(":")[0]; // "telegram" or "discord"
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

    emitter.on("text_delta", (delta) => {
      stream.onTextDelta(delta);
    });
    emitter.on("tool_call", (call) => {
      stream.onToolCall(call.toolName);
    });
    emitter.on("error", (error) => {
      stream.onError(error);
    });

    try {
      // Load prior conversation history for this channel within the token budget.
      // Budget is resolved: per-model override → memory global default.
      const tokenBudget =
        config.llm.conversationHistoryTokenBudget ??
        config.memory.conversationHistoryTokenBudget;
      const conversationHistory = message.channelId
        ? buildConversationHistory(
            sessionRepo.findRecentByChannelId(message.channelId),
            tokenBudget,
          )
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

  // Telegram adapter
  const telegramConfig = config.channels?.telegram;
  if (telegramConfig?.enabled && telegramConfig.token) {
    try {
      const telegram = new TelegramAdapter(telegramConfig.token, queuedHandleMessage, telegramConfig.allowedUserIds, channelLimiter);
      adapters.push(telegram);
      adaptersByPrefix.set("telegram", telegram);
      await telegram.start();
    } catch (err) {
      console.error("[telegram] Failed to start:", err);
    }
  }

  // Discord adapter
  const discordConfig = config.channels?.discord;
  if (discordConfig?.enabled && discordConfig.token) {
    try {
      const discord = new DiscordAdapter(discordConfig.token, queuedHandleMessage, discordConfig.allowedUserIds, channelLimiter);
      adapters.push(discord);
      adaptersByPrefix.set("discord", discord);
      await discord.start();
    } catch (err) {
      console.error("[discord] Failed to start:", err);
    }
  }

  // Slack adapter
  const slackConfig = config.channels?.slack;
  if (slackConfig?.enabled && slackConfig.token && slackConfig.appToken) {
    try {
      const slack = new SlackAdapter(slackConfig.token, slackConfig.appToken, queuedHandleMessage, slackConfig.allowedUserIds, channelLimiter);
      adapters.push(slack);
      adaptersByPrefix.set("slack", slack);
      await slack.start();
    } catch (err) {
      console.error("[slack] Failed to start:", err);
    }
  }

  // 10. Heartbeat scheduler
  let heartbeat: HeartbeatScheduler | null = null;

  if (config.heartbeat?.enabled) {
    const proactiveAdapters = adapters
      .filter((a): a is ChannelAdapter & { sendMessage: (id: string, text: string) => Promise<void> } =>
        typeof a.sendMessage === "function",
      )
      .map((a) => ({ name: a.name, sendMessage: a.sendMessage.bind(a) }));

    const sendProactiveMessage = proactiveAdapters.length > 0
      ? createProactiveMessenger(proactiveAdapters)
      : undefined;

    // Heartbeat runs non-interactively: auto-allow all, no confirmation delegate
    const heartbeatDeps: RunSessionDeps = {
      ...sessionDeps,
      governancePolicy: { read: "auto-allow", write: "auto-allow", exec: "auto-allow" },
      confirmationDelegate: undefined,
    };

    heartbeat = createHeartbeatScheduler({
      config,
      sessionDeps: heartbeatDeps,
      workspacePath,
      sendProactiveMessage,
    });
    heartbeat.start();
  }

  // 10b. Webhook endpoint
  if (config.webhook?.enabled !== false) {
    const proactiveAdapters = adapters
      .filter((a): a is ChannelAdapter & { sendMessage: (id: string, text: string) => Promise<void> } =>
        typeof a.sendMessage === "function",
      )
      .map((a) => ({ name: a.name, sendMessage: a.sendMessage.bind(a) }));

    const sendProactiveMessageForWebhook = proactiveAdapters.length > 0
      ? createProactiveMessenger(proactiveAdapters)
      : undefined;

    // Webhooks run non-interactively: auto-allow all, no confirmation delegate
    const webhookSessionDeps: RunSessionDeps = {
      ...sessionDeps,
      governancePolicy: { read: "auto-allow", write: "auto-allow", exec: "auto-allow" },
      confirmationDelegate: undefined,
    };

    const webhookApp = createWebhookRoute({
      config,
      sessionDeps: webhookSessionDeps,
      sendProactiveMessage: sendProactiveMessageForWebhook,
    });

    // Apply HTTP rate limiting to webhook routes
    if (httpLimiter) {
      const httpRateLimitMw = createRateLimitMiddleware(httpLimiter);
      app.use("/webhook/*", httpRateLimitMw);
    }

    app.route("/", webhookApp);
    console.log(`[webhook] Endpoint enabled at POST /webhook/:event` +
      (config.webhook?.secret ? " (signature verification on)" : "") +
      (config.webhook?.resultChannelId ? ` → results to ${config.webhook.resultChannelId}` : ""));
  }

  // 11. Graceful shutdown
  const shutdown = async () => {
    console.log("[server] Shutting down...");
    heartbeat?.stop();
    await closeMcpServers(mcpHandles);
    for (const adapter of adapters) {
      await adapter.stop();
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
