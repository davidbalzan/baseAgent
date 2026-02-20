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
      return {};
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
