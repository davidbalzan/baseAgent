import type {
  Plugin,
  PluginContext,
  PluginCapabilities,
  PluginAfterInitContext,
} from "@baseagent/core";

/**
 * Heartbeat plugin — signals that the heartbeat service should be enabled.
 * The actual scheduler is created by the plugin loader in bootstrap since
 * it requires RunSessionDeps (which are server-internal).
 *
 * This plugin's afterInit() is called with a `startHeartbeat` function
 * injected via the plugin loader's extended context.
 */
export function createHeartbeatPlugin(): Plugin {
  return {
    name: "heartbeat",
    phase: "services",

    async init(ctx: PluginContext): Promise<PluginCapabilities | null> {
      if (!ctx.config.heartbeat?.enabled) {
        return null;
      }
      ctx.log("[heartbeat] Plugin enabled");
      return {
        docs: [{
          title: "Heartbeat",
          filename: "HEARTBEAT.md",
          content: [
            "# Heartbeat Plugin",
            "",
            "Periodically runs an agent session on a timer, useful for proactive check-ins, monitoring, or recurring tasks.",
            "",
            "## Configuration",
            "",
            "```yaml",
            "heartbeat:",
            "  enabled: true",
            "  intervalMs: 1800000          # 30 minutes (default)",
            "  channelId: \"telegram:12345\"  # Optional: send results to a channel",
            "```",
            "",
            "## How It Works",
            "",
            "- Runs an agent session at a fixed interval (`intervalMs`, default 30 min)",
            "- The session uses auto-allow governance (no confirmation prompts)",
            "- If `channelId` is set and the target adapter supports `sendMessage`, results are forwarded to that channel",
            "- The heartbeat timer starts after all plugins are initialized",
            "",
            "## Use Cases",
            "",
            "- Periodic workspace health checks",
            "- Proactive status updates sent to a chat channel",
            "- Scheduled monitoring or reporting tasks",
          ].join("\n"),
        }],
      };
    },

    async afterInit(_ctx: PluginAfterInitContext): Promise<void> {
      // Heartbeat scheduler startup is handled by the plugin loader
      // after all adapters are ready (it needs sendProactiveMessage).
    },

    async shutdown(): Promise<void> {
      // Cleanup is handled by the plugin loader
    },
  };
}
