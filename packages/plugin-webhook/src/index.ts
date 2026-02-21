import type {
  Plugin,
  PluginContext,
  PluginCapabilities,
  PluginAfterInitContext,
} from "@baseagent/core";

/**
 * Webhook plugin — signals that the webhook route should be enabled.
 * The actual route is created by bootstrap since it requires
 * RunSessionDeps (which are server-internal).
 */
export function createWebhookPlugin(): Plugin {
  return {
    name: "webhook",
    phase: "routes",

    async init(ctx: PluginContext): Promise<PluginCapabilities | null> {
      if (ctx.config.webhook?.enabled === false) {
        return null;
      }
      ctx.log("[webhook] Plugin enabled");
      return {
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
            "- When `secret` is set, requests are verified using HMAC-SHA256 signature in the `X-Signature` header",
            "- The webhook session runs with auto-allow governance (no confirmation prompts)",
            "- HTTP rate limiting applies if `rateLimit.http` is configured",
          ].join("\n"),
        }],
      };
    },

    async afterInit(_ctx: PluginAfterInitContext): Promise<void> {
      // Route creation is handled by the plugin loader
    },

    async shutdown(): Promise<void> {
      // No cleanup needed
    },
  };
}
