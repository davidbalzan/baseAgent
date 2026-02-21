import type { AppConfig, Plugin } from "@baseagent/core";
import type { RateLimiter } from "@baseagent/gateway";

/**
 * Resolve which plugins to load from config.
 * Uses dynamic import() so unused platform SDKs are never loaded.
 *
 * When no explicit `plugins` config section exists, plugins are derived
 * from the legacy channel/heartbeat/webhook config — full backwards compat.
 */
export async function resolvePlugins(
  config: AppConfig,
  channelRateLimiter?: RateLimiter,
): Promise<Plugin[]> {
  const plugins: Plugin[] = [];

  // Channel adapters
  if (config.channels?.telegram?.enabled) {
    const { createTelegramPlugin } = await import("@baseagent/plugin-telegram");
    plugins.push(createTelegramPlugin({ rateLimiter: channelRateLimiter }));
  }

  if (config.channels?.discord?.enabled) {
    const { createDiscordPlugin } = await import("@baseagent/plugin-discord");
    plugins.push(createDiscordPlugin({ rateLimiter: channelRateLimiter }));
  }

  if (config.channels?.slack?.enabled) {
    const { createSlackPlugin } = await import("@baseagent/plugin-slack");
    plugins.push(createSlackPlugin({ rateLimiter: channelRateLimiter }));
  }

  // Services
  if (config.heartbeat?.enabled) {
    const { createHeartbeatPlugin } = await import("@baseagent/plugin-heartbeat");
    plugins.push(createHeartbeatPlugin());
  }

  // Scheduler (always loaded — tools are harmless)
  {
    const { createSchedulerPlugin } = await import("@baseagent/plugin-scheduler");
    plugins.push(createSchedulerPlugin());
  }

  // Dashboard chat (always loaded — zero external dependencies)
  {
    const { createChatPlugin } = await import("@baseagent/plugin-chat");
    plugins.push(createChatPlugin());
  }

  // Routes
  if (config.webhook?.enabled !== false) {
    const { createWebhookPlugin } = await import("@baseagent/plugin-webhook");
    plugins.push(createWebhookPlugin());
  }

  return plugins;
}
