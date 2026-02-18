import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// packages/server/src → repo root
const ROOT_DIR = resolve(__dirname, "..", "..", "..");

import {
  loadConfig,
  resolveModel,
  LoopEmitter,
  type LoopState,
} from "@baseagent/core";
import {
  initDatabase,
  pushSchema,
  SessionRepository,
  TraceRepository,
  MessageRepository,
  deserializeMessages,
  loadMemoryFiles,
} from "@baseagent/memory";
import {
  ToolRegistry,
  finishTool,
  createMemoryReadTool,
  createMemoryWriteTool,
  createFileReadTool,
  createFileWriteTool,
  createFileEditTool,
  createFileListTool,
  createShellExecTool,
  createWebFetchTool,
  createWebSearchTool,
  loadSkills,
} from "@baseagent/tools";
import {
  TelegramAdapter,
  DiscordAdapter,
  createQueuedHandler,
  createProactiveMessenger,
  type HandleMessageFn,
  type ChannelAdapter,
} from "@baseagent/gateway";

import { healthRoute } from "./health.js";
import { runSession, type RunSessionDeps } from "./run-session.js";
import { createHeartbeatScheduler, type HeartbeatScheduler } from "./heartbeat.js";

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

  // 3. Resolve LLM model
  const model = await resolveModel(config);
  console.log(`[model] Resolved ${config.llm.provider}/${config.llm.model}`);

  // 4. Register built-in tools
  const workspacePath = resolve(ROOT_DIR, "workspace");
  const registry = new ToolRegistry();
  registry.register(finishTool);
  registry.register(createMemoryReadTool(workspacePath));
  registry.register(createMemoryWriteTool(workspacePath));
  registry.register(createFileReadTool(workspacePath));
  registry.register(createFileWriteTool(workspacePath));
  registry.register(createFileEditTool(workspacePath));
  registry.register(createFileListTool(workspacePath));
  registry.register(createShellExecTool(workspacePath));
  registry.register(createWebFetchTool());
  registry.register(createWebSearchTool());
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

  // 5. Load memory files for system prompt
  const systemPrompt = loadMemoryFiles(workspacePath, config.memory.maxTokenBudget);
  console.log(`[memory] System prompt loaded (${systemPrompt.length} chars)`);

  // 6. Create repositories
  const sessionRepo = new SessionRepository(db);
  const traceRepo = new TraceRepository(db);
  const messageRepo = new MessageRepository(db);

  // Shared deps for runSession
  const sessionDeps: RunSessionDeps = {
    model,
    systemPrompt,
    registry,
    config,
    workspacePath,
    sessionRepo,
    traceRepo,
    messageRepo,
  };

  // 7. Build Hono app
  const app = new Hono();
  app.route("/", healthRoute);

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
    console.log(`[server] baseAgent listening on http://${host}:${info.port}`);
  });

  // 9. Channel adapters
  const adapters: ChannelAdapter[] = [];

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
      const result = await runSession(
        { input: message.text, channelId: message.channelId },
        sessionDeps,
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
      const telegram = new TelegramAdapter(telegramConfig.token, queuedHandleMessage);
      adapters.push(telegram);
      await telegram.start();
    } catch (err) {
      console.error("[telegram] Failed to start:", err);
    }
  }

  // Discord adapter
  const discordConfig = config.channels?.discord;
  if (discordConfig?.enabled && discordConfig.token) {
    try {
      const discord = new DiscordAdapter(discordConfig.token, queuedHandleMessage);
      adapters.push(discord);
      await discord.start();
    } catch (err) {
      console.error("[discord] Failed to start:", err);
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

    heartbeat = createHeartbeatScheduler({
      config,
      sessionDeps,
      workspacePath,
      sendProactiveMessage,
    });
    heartbeat.start();
  }

  // 11. Graceful shutdown
  const shutdown = async () => {
    console.log("[server] Shutting down...");
    heartbeat?.stop();
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
