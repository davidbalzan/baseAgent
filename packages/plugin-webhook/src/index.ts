import { Hono } from "hono";
import type {
  Plugin,
  PluginContext,
  PluginCapabilities,
  PluginAfterInitContext,
} from "@baseagent/core";
import { createWebhookRoute } from "./webhook.js";

export function createWebhookPlugin(): Plugin {
  // The real webhook Hono app, created in afterInit once session runner is available.
  let innerApp: Hono | null = null;

  return {
    name: "webhook",
    phase: "routes",

    async init(ctx: PluginContext): Promise<PluginCapabilities | null> {
      if (ctx.config.webhook?.enabled === false) {
        return null;
      }
      ctx.log("[webhook] Plugin enabled");

      // Create a proxy Hono app that forwards to the real webhook app
      // once it's wired up in afterInit. This lets us return routes
      // from init() while deferring session runner binding to afterInit.
      const proxyApp = new Hono();
      proxyApp.all("/webhook/:event", async (c) => {
        if (!innerApp) {
          return c.json({ error: "Webhook not ready — plugin still initializing" }, 503);
        }
        return innerApp.fetch(c.req.raw);
      });

      return {
        routes: proxyApp,
        routePrefix: "/",
        docs: [{
          title: "Webhook",
          filename: "WEBHOOK.md",
          content: [
            "# Webhook Plugin",
            "",
            "Exposes an HTTP endpoint for triggering agent sessions from external services (CI/CD, GitHub, monitoring, etc.).",
            "",
            "## Configuration",
            "",
            "```yaml",
            "webhook:",
            "  enabled: true                        # Default: true",
            "  secret: \"my-hmac-secret\"              # Optional: HMAC-SHA256 signature verification",
            "  resultChannelId: \"telegram:12345\"     # Optional: forward results to a channel",
            "```",
            "",
            "## Endpoint",
            "",
            "```",
            "POST /webhook/:event",
            "```",
            "",
            "- `:event` — An arbitrary event name passed to the agent as context",
            "- Request body is forwarded as the agent session input",
            "- If `secret` is configured, the request must include a valid HMAC-SHA256 signature",
            "- If `resultChannelId` is set, the agent's output is forwarded to that channel",
            "",
            "## Security",
            "",
            "- When `secret` is set, requests are verified using HMAC-SHA256 signature in the `X-Webhook-Signature` header",
            "- The webhook session runs with auto-allow governance (no confirmation prompts)",
            "- HTTP rate limiting applies if `rateLimit.http` is configured",
          ].join("\n"),
        }],
      };
    },

    async afterInit(ctx: PluginAfterInitContext): Promise<void> {
      const runSession = ctx.createSessionRunner();
      innerApp = createWebhookRoute({
        secret: ctx.config.webhook?.secret,
        resultChannelId: ctx.config.webhook?.resultChannelId,
        runSession,
        sendProactiveMessage: ctx.sendProactiveMessage,
      });
    },

    async shutdown(): Promise<void> {
      innerApp = null;
    },
  };
}

export { createWebhookRoute } from "./webhook.js";
