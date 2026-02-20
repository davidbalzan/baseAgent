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
      return {};
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
