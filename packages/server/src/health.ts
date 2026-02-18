import { Hono } from "hono";

const startTime = Date.now();

export const healthRoute = new Hono();

healthRoute.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});
