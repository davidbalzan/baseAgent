import {
  createLogger,
  registerModelProvider,
  clearModelProviders,
  type Plugin,
  type PluginContext,
  type PluginCapabilities,
  type PluginPhase,
  type PluginAfterInitContext,
  type ChannelAdapterLike,
  type DashboardTab,
  type PluginDoc,
  type HandleMessageFnLike,
  type RunSessionLikeFn,
} from "@baseagent/core";
import type { Hono } from "hono";

/** Result of loading all plugins. */
export interface PluginLoadResult {
  adapters: ChannelAdapterLike[];
  adaptersByPrefix: Map<string, ChannelAdapterLike>;
  routes: Array<{ app: Hono; prefix: string }>;
  dashboardTabs: DashboardTab[];
  docs: PluginDoc[];
  enabledPlugins: Plugin[];
  /** Call afterInit() on all plugins once handleMessage is ready. */
  afterInit(
    handleMessage: HandleMessageFnLike,
    queuedHandleMessage: HandleMessageFnLike,
    extras?: {
      createSessionRunner: () => RunSessionLikeFn;
      sendProactiveMessage?: (channelId: string, text: string) => Promise<void>;
    },
  ): Promise<void>;
  /** Shutdown all plugins in reverse order. */
  shutdown(): Promise<void>;
}

/** Phase ordering — plugins are loaded in this order. */
const PHASE_ORDER: PluginPhase[] = ["tools", "adapters", "routes", "services"];

function phaseIndex(phase: PluginPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

/**
 * Load all plugins in phase order.
 * Each plugin's init() is called, failures are isolated (logged and skipped).
 */
export async function loadPlugins(
  plugins: Plugin[],
  ctx: PluginContext,
): Promise<PluginLoadResult> {
  // Sort by phase
  const sorted = [...plugins].sort((a, b) => phaseIndex(a.phase) - phaseIndex(b.phase));

  const adapters: ChannelAdapterLike[] = [];
  const adaptersByPrefix = new Map<string, ChannelAdapterLike>();
  const routes: Array<{ app: Hono; prefix: string }> = [];
  const dashboardTabs: DashboardTab[] = [];
  const docs: PluginDoc[] = [];
  const enabledPlugins: Plugin[] = [];

  for (const plugin of sorted) {
    try {
      const pluginLogger = createLogger(plugin.name);
      const pluginCtx: PluginContext = {
        ...ctx,
        log: (msg) => pluginLogger.log(msg),
        warn: (msg) => pluginLogger.warn(msg),
      };
      const caps = await plugin.init(pluginCtx);
      if (caps === null) {
        continue; // Plugin disabled itself
      }

      enabledPlugins.push(plugin);

      // Collect tools
      if (caps.tools) {
        for (const tool of caps.tools) {
          ctx.registerTool(tool);
        }
      }

      // Collect adapters
      if (caps.adapter) {
        adapters.push(caps.adapter);
        adaptersByPrefix.set(caps.adapter.name, caps.adapter);
      }

      // Collect routes
      if (caps.routes) {
        routes.push({
          app: caps.routes as Hono,
          prefix: caps.routePrefix ?? `/${plugin.name}`,
        });
      }

      // Collect dashboard tabs
      if (caps.dashboardTabs) {
        dashboardTabs.push(...caps.dashboardTabs);
      }

      // Collect plugin-contributed docs
      if (caps.docs) {
        docs.push(...caps.docs);
      }

      // Register plugin-contributed model providers
      if (caps.modelProvider) {
        registerModelProvider(caps.modelProvider.name, caps.modelProvider.factory);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.warn(`[plugin-loader] Plugin "${plugin.name}" init failed: ${msg}`);
    }
  }

  return {
    adapters,
    adaptersByPrefix,
    routes,
    dashboardTabs,
    docs,
    enabledPlugins,

    async afterInit(
      handleMessage: HandleMessageFnLike,
      queuedHandleMessage: HandleMessageFnLike,
      extras?: {
        createSessionRunner: () => RunSessionLikeFn;
        sendProactiveMessage?: (channelId: string, text: string) => Promise<void>;
      },
    ): Promise<void> {
      const noop: RunSessionLikeFn = async () => ({ sessionId: "", output: "" });
      const afterCtx: PluginAfterInitContext = {
        ...ctx,
        getAdapter: (prefix: string) => adaptersByPrefix.get(prefix),
        getAdapters: () => [...adaptersByPrefix.values()],
        handleMessage,
        queuedHandleMessage,
        registerAdapter(adapter: ChannelAdapterLike): void {
          adapters.push(adapter);
          adaptersByPrefix.set(adapter.name, adapter);
        },
        createSessionRunner: extras?.createSessionRunner ?? (() => noop),
        sendProactiveMessage: extras?.sendProactiveMessage,
      };

      for (const plugin of enabledPlugins) {
        if (!plugin.afterInit) continue;
        try {
          await plugin.afterInit(afterCtx);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          ctx.warn(`[plugin-loader] Plugin "${plugin.name}" afterInit failed: ${msg}`);
        }
      }
    },

    async shutdown(): Promise<void> {
      clearModelProviders();
      // Shutdown in reverse order
      for (const plugin of [...enabledPlugins].reverse()) {
        if (!plugin.shutdown) continue;
        try {
          await plugin.shutdown();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const shutdownLogger = createLogger(plugin.name);
          shutdownLogger.error(`Shutdown failed: ${msg}`);
        }
      }
    },
  };
}
