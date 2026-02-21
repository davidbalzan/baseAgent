import type {
  Plugin,
  PluginContext,
  PluginCapabilities,
  PluginAfterInitContext,
} from "@baseagent/core";
import { createHeartbeatScheduler, type HeartbeatScheduler } from "./heartbeat.js";

export interface HeartbeatPluginDeps {
  listDistinctChannels?: () => Array<{ channelId: string; sessionCount: number }>;
}

export function createHeartbeatPlugin(pluginDeps?: HeartbeatPluginDeps): Plugin {
  let scheduler: HeartbeatScheduler | null = null;

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
            "  reviewIntervalMs: 21600000   # 6 hours (default) — memory review interval",
            "```",
            "",
            "## How It Works",
            "",
            "- Runs an agent session at a fixed interval (`intervalMs`, default 30 min)",
            "- The session uses auto-allow governance (no confirmation prompts)",
            "- If `channelId` is set and the target adapter supports `sendMessage`, results are forwarded to that channel",
            "- The heartbeat timer starts after all plugins are initialized",
            "",
            "## Memory Review",
            "",
            "- After each heartbeat tick, checks if a memory review is due (default: every 6 hours)",
            "- Reviews recent conversations per active channel using `review_sessions`",
            "- Writes insights to per-user memory files (USER.md) scoped by channelId",
            "- Only records NEW insights not already captured",
            "",
            "## Use Cases",
            "",
            "- Periodic workspace health checks",
            "- Proactive status updates sent to a chat channel",
            "- Scheduled monitoring or reporting tasks",
            "- Automatic memory consolidation from conversations",
          ].join("\n"),
        }],
      };
    },

    async afterInit(ctx: PluginAfterInitContext): Promise<void> {
      const runSession = ctx.createSessionRunner();
      scheduler = createHeartbeatScheduler({
        intervalMs: ctx.config.heartbeat?.intervalMs ?? 1_800_000,
        channelId: ctx.config.heartbeat?.channelId,
        workspacePath: ctx.workspacePath,
        runSession,
        sendProactiveMessage: ctx.sendProactiveMessage,
        reviewIntervalMs: ctx.config.heartbeat?.reviewIntervalMs,
        listDistinctChannels: pluginDeps?.listDistinctChannels,
      });
      scheduler.start();
    },

    async shutdown(): Promise<void> {
      scheduler?.stop();
      scheduler = null;
    },
  };
}
