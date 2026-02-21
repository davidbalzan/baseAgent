import type {
  Plugin,
  PluginContext,
  PluginCapabilities,
  PluginAfterInitContext,
} from "@baseagent/core";
import type { RateLimiter } from "@baseagent/gateway";
import { TelegramAdapter } from "./telegram/telegram-adapter.js";

export interface TelegramPluginOptions {
  rateLimiter?: RateLimiter;
}

export function createTelegramPlugin(opts?: TelegramPluginOptions): Plugin {
  let adapter: TelegramAdapter | undefined;

  return {
    name: "telegram",
    phase: "adapters",

    async init(ctx: PluginContext): Promise<PluginCapabilities | null> {
      const config = ctx.config.channels?.telegram;
      if (!config?.enabled || !config.token) {
        return null;
      }
      return {
        docs: [{
          title: "Telegram",
          filename: "TELEGRAM.md",
          content: [
            "# Telegram Plugin",
            "",
            "Connects the agent to Telegram as a chat channel using the Bot API with long-polling.",
            "",
            "## Configuration",
            "",
            "```yaml",
            "channels:",
            "  telegram:",
            "    enabled: true",
            "    token: \"BOT_TOKEN\"        # From @BotFather",
            "    allowedUserIds:            # Optional whitelist",
            "      - \"123456789\"",
            "```",
            "",
            "## How It Works",
            "",
            "- Uses long-polling to receive messages (no webhook server needed)",
            "- Messages are routed through the queued handler to prevent concurrent sessions per channel",
            "- Channel IDs are prefixed as `telegram:<chat_id>`",
            "- Supports optional rate limiting via the `rateLimit.channel` config",
            "- If `allowedUserIds` is set, messages from other users are silently ignored",
            "",
            "## Lifecycle",
            "",
            "- **init()** — Validates config, returns empty capabilities",
            "- **afterInit()** — Creates the `TelegramAdapter`, registers it, and starts polling",
            "- **shutdown()** — Stops the polling loop gracefully",
          ].join("\n"),
        }],
      };
    },

    async afterInit(ctx: PluginAfterInitContext): Promise<void> {
      const config = ctx.config.channels?.telegram;
      if (!config?.enabled || !config.token) return;

      try {
        adapter = new TelegramAdapter(
          config.token,
          ctx.queuedHandleMessage,
          config.allowedUserIds,
          opts?.rateLimiter,
        );
        ctx.registerAdapter(adapter);
        await adapter.start();
      } catch (err) {
        ctx.warn(`[telegram] Failed to start: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    async shutdown(): Promise<void> {
      if (adapter) {
        await adapter.stop();
      }
    },
  };
}

export { TelegramAdapter } from "./telegram/telegram-adapter.js";
