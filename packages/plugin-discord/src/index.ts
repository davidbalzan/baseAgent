import type {
  Plugin,
  PluginContext,
  PluginCapabilities,
  PluginAfterInitContext,
} from "@baseagent/core";
import type { RateLimiter } from "@baseagent/gateway";
import { DiscordAdapter } from "./discord/discord-adapter.js";

export interface DiscordPluginOptions {
  rateLimiter?: RateLimiter;
}

export function createDiscordPlugin(opts?: DiscordPluginOptions): Plugin {
  let adapter: DiscordAdapter | undefined;

  return {
    name: "discord",
    phase: "adapters",

    async init(ctx: PluginContext): Promise<PluginCapabilities | null> {
      const config = ctx.config.channels?.discord;
      if (!config?.enabled || !config.token) {
        return null;
      }
      return {
        docs: [{
          title: "Discord",
          filename: "DISCORD.md",
          content: [
            "# Discord Plugin",
            "",
            "Connects the agent to Discord as a chat channel using the Discord.js gateway.",
            "",
            "## Configuration",
            "",
            "```yaml",
            "channels:",
            "  discord:",
            "    enabled: true",
            "    token: \"BOT_TOKEN\"        # From Discord Developer Portal",
            "    allowedUserIds:            # Optional whitelist",
            "      - \"123456789012345678\"",
            "```",
            "",
            "## How It Works",
            "",
            "- Connects via the Discord gateway (WebSocket) to receive message events",
            "- Messages are routed through the queued handler to prevent concurrent sessions per channel",
            "- Channel IDs are prefixed as `discord:<channel_id>`",
            "- Supports optional rate limiting via the `rateLimit.channel` config",
            "- If `allowedUserIds` is set, messages from other users are silently ignored",
            "",
            "## Lifecycle",
            "",
            "- **init()** — Validates config, returns capabilities",
            "- **afterInit()** — Creates the `DiscordAdapter`, registers it, and connects to gateway",
            "- **shutdown()** — Disconnects the gateway client gracefully",
          ].join("\n"),
        }],
      };
    },

    async afterInit(ctx: PluginAfterInitContext): Promise<void> {
      const config = ctx.config.channels?.discord;
      if (!config?.enabled || !config.token) return;

      try {
        adapter = new DiscordAdapter(
          config.token,
          ctx.queuedHandleMessage,
          config.allowedUserIds,
          opts?.rateLimiter,
        );
        ctx.registerAdapter(adapter);
        await adapter.start();
      } catch (err) {
        ctx.warn(`[discord] Failed to start: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    async shutdown(): Promise<void> {
      if (adapter) {
        await adapter.stop();
      }
    },
  };
}

export { DiscordAdapter } from "./discord/discord-adapter.js";
