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
} from "@baseagent/tools";

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

  // 4. Register tools
  const workspacePath = resolve(ROOT_DIR, "workspace");
  const registry = new ToolRegistry();
  registry.register(finishTool);
  registry.register(createMemoryReadTool(workspacePath));
  registry.register(createMemoryWriteTool(workspacePath));
  console.log(`[tools] Registered: ${registry.names().join(", ")}`);

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
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
