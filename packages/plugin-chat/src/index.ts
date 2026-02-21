import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { Plugin, PluginCapabilities, PluginContext, PluginAfterInitContext } from "@baseagent/core";
import { ChatBus } from "./chat-bus.js";
import { ChatAdapter } from "./chat-adapter.js";
import { chatDashboardTab } from "./dashboard-tab.js";

export function createChatPlugin(): Plugin {
  const bus = new ChatBus();
  let adapter: ChatAdapter | undefined;

  return {
    name: "chat",
    phase: "adapters",

    async init(ctx: PluginContext): Promise<PluginCapabilities> {
      ctx.log("[chat] Dashboard chat plugin enabled");

      // Build routes with closure over mutable adapter ref
      const app = new Hono();

      // POST /send — browser sends a message
      app.post("/send", async (c) => {
        if (!adapter) {
          return c.json({ error: "Chat adapter not ready" }, 503);
        }
        const body = await c.req.json<{ text: string }>();
        if (!body.text || typeof body.text !== "string") {
          return c.json({ error: "Missing 'text' field" }, 400);
        }
        adapter.handleIncoming(body.text.trim());
        return c.json({ ok: true });
      });

      // GET /events — SSE stream
      app.get("/events", async (c) => {
        return streamSSE(c, async (stream) => {
          const unsubscribe = bus.subscribe((event) => {
            // Map "error" type to "error_event" to avoid colliding with SSE's built-in error event
            const eventName = event.type === "error" ? "error_event" : event.type;
            stream.writeSSE({ data: JSON.stringify(event), event: eventName }).catch(() => {});
          });

          // Initial ping
          await stream.writeSSE({ data: "{}", event: "ping" });

          // Keep-alive every 20s
          const pingId = setInterval(() => {
            stream.writeSSE({ data: JSON.stringify({ ts: new Date().toISOString() }), event: "ping" }).catch(() => {});
          }, 20_000);

          await new Promise<void>((resolve) => stream.onAbort(resolve));
          clearInterval(pingId);
          unsubscribe();
        });
      });

      return {
        routes: app,
        routePrefix: "/chat",
        dashboardTabs: [chatDashboardTab],
      };
    },

    async afterInit(ctx: PluginAfterInitContext): Promise<void> {
      adapter = new ChatAdapter(ctx.queuedHandleMessage, bus);
      ctx.registerAdapter(adapter);
      ctx.log("[chat] Adapter registered");
    },

    async shutdown(): Promise<void> {
      if (adapter) {
        await adapter.stop();
      }
    },
  };
}
