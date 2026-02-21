import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { MEMORY_FILES, type SessionRepository, type TraceRepository } from "@baseagent/memory";
import type { FallbackModelStatusEntry } from "@baseagent/core";
import type { LiveSessionBus } from "./live-stream.js";

// All memory files are editable via the dashboard (admin-level access).
// The MM-6 restriction applies only to agent-side file_write/file_edit tools.
const ALLOWED_FILE_NAMES: Set<string> = new Set(MEMORY_FILES.map((f) => f.filename));

export interface DashboardApiDeps {
  sessionRepo: SessionRepository;
  traceRepo: TraceRepository;
  workspacePath: string;
  liveSessionBus?: LiveSessionBus;
  /** When set, all /api/* routes require `Authorization: Bearer <secret>`. */
  dashboardSecret?: string;
  /** Callback to reload skills at runtime (wired by built-in-tools plugin). */
  reloadSkills?: () => Promise<{ loaded: string[]; failed: { name: string; error: string }[] }>;
  /** Runtime model/fallback status for dashboard observability. */
  getModelStatus?: () => {
    chain: FallbackModelStatusEntry[];
    fallbackCooldownMs: number;
    fallbackCooldownReasons: string[];
  };
}

export function createDashboardApi(deps: DashboardApiDeps) {
  const { sessionRepo, traceRepo, workspacePath, liveSessionBus } = deps;
  const app = new Hono();

  // Optional bearer token auth for all /api/* routes
  if (deps.dashboardSecret) {
    const secret = deps.dashboardSecret;
    app.use("/api/*", async (c, next) => {
      const auth = c.req.header("authorization");
      if (!auth || auth !== `Bearer ${secret}`) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      await next();
    });
  }

  // ─── SESSION ENDPOINTS ────────────────────────────────────────────────

  // GET /api/sessions — list recent sessions
  app.get("/api/sessions", (c) => {
    const limit = Number(c.req.query("limit") ?? "50");
    const sessions = sessionRepo.listRecent(Math.min(limit, 100));
    return c.json({ sessions });
  });

  // GET /api/sessions/:id — single session detail
  app.get("/api/sessions/:id", (c) => {
    const session = sessionRepo.findById(c.req.param("id"));
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }
    return c.json({ session });
  });

  // GET /api/sessions/:id/traces — trace events for a session
  app.get("/api/sessions/:id/traces", (c) => {
    const session = sessionRepo.findById(c.req.param("id"));
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }
    const rawTraces = traceRepo.findBySession(c.req.param("id"));

    const traces = rawTraces
      .map((t) => ({
        ...t,
        data: t.data ? JSON.parse(t.data) : null,
      }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return c.json({ traces });
  });

  // GET /api/costs — aggregate cost analytics
  app.get("/api/costs", (c) => {
    const aggregates = sessionRepo.getCostAggregates();
    return c.json(aggregates);
  });

  // GET /api/model/status — fallback chain and cooldown state
  app.get("/api/model/status", (c) => {
    if (!deps.getModelStatus) {
      return c.json({
        chain: [],
        fallbackCooldownMs: 0,
        fallbackCooldownReasons: [],
        available: false,
        updatedAt: new Date().toISOString(),
      });
    }

    const status = deps.getModelStatus();
    return c.json({
      ...status,
      available: true,
      updatedAt: new Date().toISOString(),
    });
  });

  // ─── LIVE STREAM (UI-2) ───────────────────────────────────────────────

  // GET /api/live — SSE stream of live session events
  app.get("/api/live", async (c) => {
    if (!liveSessionBus) {
      return c.json({ error: "Live stream not available" }, 503);
    }
    const bus = liveSessionBus;

    return streamSSE(c, async (stream) => {
      const unsubscribe = bus.subscribe((event) => {
        stream.writeSSE({ data: JSON.stringify(event), event: event.type }).catch(() => {});
      });

      // Send initial ping so the client knows the connection is alive
      await stream.writeSSE({ data: "{}", event: "ping" });

      // Keep-alive pings every 20 seconds
      const pingId = setInterval(() => {
        stream.writeSSE({ data: JSON.stringify({ ts: new Date().toISOString() }), event: "ping" }).catch(() => {});
      }, 20_000);

      await new Promise<void>((resolve) => stream.onAbort(resolve));
      clearInterval(pingId);
      unsubscribe();
    });
  });

  // ─── MEMORY FILES (UI-3) ─────────────────────────────────────────────

  // GET /api/memory — list all memory files with content
  app.get("/api/memory", (c) => {
    const files = MEMORY_FILES.map((mf) => {
      const filePath = resolve(workspacePath, mf.filename);
      const exists = existsSync(filePath);
      let content = "";
      if (exists) {
        try { content = readFileSync(filePath, "utf-8"); } catch { content = ""; }
      }
      return { name: mf.filename, label: mf.name, description: mf.description, exists, content };
    });
    return c.json({ files });
  });

  // PUT /api/memory/:file — overwrite a memory file (admin/dashboard-level write)
  app.put("/api/memory/:file", async (c) => {
    const fileName = c.req.param("file");

    // Guard: only known filenames (no path traversal). basename() prevents ../ attacks.
    if (!ALLOWED_FILE_NAMES.has(fileName) || fileName !== basename(fileName)) {
      return c.json({ error: "Unknown or disallowed file" }, 403);
    }

    let body: { content: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (typeof body.content !== "string") {
      return c.json({ error: "Missing content field" }, 400);
    }

    const filePath = resolve(workspacePath, fileName);
    try {
      writeFileSync(filePath, body.content, "utf-8");
    } catch (err) {
      return c.json({ error: `Write failed: ${err instanceof Error ? err.message : String(err)}` }, 500);
    }

    return c.json({ ok: true, bytes: Buffer.byteLength(body.content, "utf-8") });
  });

  // ─── ADMIN ─────────────────────────────────────────────────────────

  // POST /api/admin/reload-skills — hot-reload skills without restart
  app.post("/api/admin/reload-skills", async (c) => {
    if (!deps.reloadSkills) {
      return c.json({ error: "Skill reload not configured" }, 501);
    }
    try {
      const result = await deps.reloadSkills();
      return c.json({ ok: true, loaded: result.loaded, failed: result.failed });
    } catch (err) {
      return c.json({ error: `Reload failed: ${err instanceof Error ? err.message : String(err)}` }, 500);
    }
  });

  return app;
}
