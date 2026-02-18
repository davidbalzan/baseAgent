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
  runAgentLoop,
  LoopEmitter,
} from "@baseagent/core";
import {
  initDatabase,
  pushSchema,
  SessionRepository,
  TraceRepository,
  loadMemoryFiles,
} from "@baseagent/memory";
import {
  ToolRegistry,
  createToolExecutor,
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
  type HandleMessageFn,
  type ChannelAdapter,
} from "@baseagent/gateway";

import { healthRoute } from "./health.js";

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

  // 7. Build Hono app
  const app = new Hono();
  app.route("/", healthRoute);

  // Temporary POST /run endpoint for testing
  app.post("/run", async (c) => {
    const body = await c.req.json<{ input: string; channelId?: string }>();

    if (!body.input || typeof body.input !== "string") {
      return c.json({ error: "Missing 'input' field" }, 400);
    }

    // Create session
    const session = sessionRepo.create({
      input: body.input,
      channelId: body.channelId,
    });

    // Set up emitter to persist traces
    const emitter = new LoopEmitter();
    emitter.on("trace", (event) => {
      traceRepo.insert(event);
    });

    // Build tool executor
    const executeTool = createToolExecutor((name) => registry.get(name));

    // Run the agent loop
    const result = await runAgentLoop(body.input, {
      model,
      systemPrompt,
      tools: registry.getAll(),
      executeTool,
      maxIterations: config.agent.maxIterations,
      timeoutMs: config.agent.timeoutMs,
      costCapUsd: config.agent.costCapUsd,
      sessionId: session.id,
      compactionThreshold: config.memory.compactionThreshold,
      workspacePath,
      toolOutputDecayIterations: config.memory.toolOutputDecayIterations,
      toolOutputDecayThresholdChars: config.memory.toolOutputDecayThresholdChars,
    }, emitter);

    // Update session with results
    sessionRepo.updateStatus(session.id, result.state.status, result.output);
    sessionRepo.updateUsage(session.id, {
      totalTokens: result.state.totalTokens,
      promptTokens: result.state.promptTokens,
      completionTokens: result.state.completionTokens,
      totalCostUsd: result.state.estimatedCostUsd,
      iterations: result.state.iteration,
    });

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
    const session = sessionRepo.create({
      input: message.text,
      channelId: message.channelId,
    });

    const emitter = new LoopEmitter();

    emitter.on("trace", (event) => {
      traceRepo.insert(event);
    });
    emitter.on("text_delta", (delta) => {
      stream.onTextDelta(delta);
    });
    emitter.on("tool_call", (call) => {
      stream.onToolCall(call.toolName);
    });
    emitter.on("error", (error) => {
      stream.onError(error);
    });

    const executeTool = createToolExecutor((name) => registry.get(name));

    try {
      const result = await runAgentLoop(message.text, {
        model,
        systemPrompt,
        tools: registry.getAll(),
        executeTool,
        maxIterations: config.agent.maxIterations,
        timeoutMs: config.agent.timeoutMs,
        costCapUsd: config.agent.costCapUsd,
        sessionId: session.id,
        compactionThreshold: config.memory.compactionThreshold,
        workspacePath,
        toolOutputDecayIterations: config.memory.toolOutputDecayIterations,
        toolOutputDecayThresholdChars: config.memory.toolOutputDecayThresholdChars,
      }, emitter);

      sessionRepo.updateStatus(session.id, result.state.status, result.output);
      sessionRepo.updateUsage(session.id, {
        totalTokens: result.state.totalTokens,
        promptTokens: result.state.promptTokens,
        completionTokens: result.state.completionTokens,
        totalCostUsd: result.state.estimatedCostUsd,
        iterations: result.state.iteration,
      });

      stream.onFinish(result.output);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      sessionRepo.updateStatus(session.id, "failed", error.message);
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

  // 10. Graceful shutdown
  const shutdown = async () => {
    console.log("[server] Shutting down...");
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
