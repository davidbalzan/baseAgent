import { Hono } from "hono";
import type { SessionRepository, TraceRepository } from "@baseagent/memory";

export interface DashboardApiDeps {
  sessionRepo: SessionRepository;
  traceRepo: TraceRepository;
}

export function createDashboardApi(deps: DashboardApiDeps) {
  const { sessionRepo, traceRepo } = deps;
  const app = new Hono();

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

    // Parse JSON data field and sort by timestamp
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

  return app;
}
