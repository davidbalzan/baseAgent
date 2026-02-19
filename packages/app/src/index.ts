import { serve } from "@hono/node-server";
import { bootstrapAgent } from "@baseagent/server";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// packages/app/src → repo root (3 levels up)
const ROOT_DIR = resolve(__dirname, "..", "..", "..");

const { app, config, shutdown } = await bootstrapAgent(
  resolve(ROOT_DIR, "config", "default.yaml"),
);

// ─────────────────────────────────────────────────────────────────────────────
// YOUR APP — Add routes, middleware, and integrations here.
// The agent is already running above. All built-in endpoints are registered:
//
//   GET  /health                    — health check
//   POST /run                       — start a new agent session
//   POST /resume                    — resume a stopped session
//   POST /webhook/:event            — external event trigger
//   GET  /dashboard                 — trace replay web UI
//   GET  /api/sessions              — list recent sessions
//   GET  /api/sessions/:id          — single session detail
//   GET  /api/sessions/:id/traces   — trace events for a session
//   GET  /api/live                  — SSE stream of live session events
//   GET  /api/memory                — list workspace memory files
//   PUT  /api/memory/:file          — update a memory file
//
// Example custom route:
//   app.get("/my-status", (c) => c.json({ status: "ok" }));
// ─────────────────────────────────────────────────────────────────────────────

const port = config.server.port;
const host = config.server.host;

serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  console.log(`[app] Listening on http://${host}:${info.port}`);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
