import type {
  Plugin,
  PluginContext,
  PluginCapabilities,
  PluginAfterInitContext,
} from "@baseagent/core";
import type { RateLimiter } from "@baseagent/gateway";
import { SlackAdapter } from "./slack/slack-adapter.js";

export interface SlackPluginOptions {
  rateLimiter?: RateLimiter;
}

export function createSlackPlugin(opts?: SlackPluginOptions): Plugin {
  let adapter: SlackAdapter | undefined;

  return {
    name: "slack",
    phase: "adapters",

    async init(ctx: PluginContext): Promise<PluginCapabilities | null> {
      const config = ctx.config.channels?.slack;
      if (!config?.enabled || !config.token || !config.appToken) {
        return null;
      }
      return {
        docs: [{
          title: "Slack",
          filename: "SLACK.md",
          content: [
            "# Slack Plugin",
            "",
            "Connects the agent to Slack as a chat channel using Socket Mode.",
            "",
            "## Configuration",
            "",
            "```yaml",
            "channels:",
            "  slack:",
            "    enabled: true",
            "    token: \"xoxb-...\"          # Bot token",
            "    appToken: \"xapp-...\"       # App-level token for Socket Mode",
            "    allowedUserIds:            # Optional whitelist",
            "      - \"U01ABCDEF\"",
            "```",
            "",
            "## How It Works",
            "",
            "- Connects via Slack Socket Mode (WebSocket) — no public URL needed",
            "- Requires both a bot token (`xoxb-`) and an app-level token (`xapp-`)",
            "- Messages are routed through the queued handler to prevent concurrent sessions per channel",
            "- Channel IDs are prefixed as `slack:<channel_id>`",
            "- Supports optional rate limiting via the `rateLimit.channel` config",
            "- If `allowedUserIds` is set, messages from other users are silently ignored",
            "",
            "## Lifecycle",
            "",
            "- **init()** — Validates config (requires both tokens), returns capabilities",
            "- **afterInit()** — Creates the `SlackAdapter`, registers it, and connects via Socket Mode",
            "- **shutdown()** — Disconnects the Socket Mode client gracefully",
          ].join("\n"),
        }],
      };
    },

    async afterInit(ctx: PluginAfterInitContext): Promise<void> {
      const config = ctx.config.channels?.slack;
      if (!config?.enabled || !config.token || !config.appToken) return;

      try {
        adapter = new SlackAdapter(
          config.token,
          config.appToken,
          ctx.queuedHandleMessage,
          config.allowedUserIds,
          opts?.rateLimiter,
        );
        ctx.registerAdapter(adapter);
        await adapter.start();
      } catch (err) {
        ctx.warn(`[slack] Failed to start: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    async shutdown(): Promise<void> {
      if (adapter) {
        await adapter.stop();
      }
    },
  };
}

export { SlackAdapter } from "./slack/slack-adapter.js";
