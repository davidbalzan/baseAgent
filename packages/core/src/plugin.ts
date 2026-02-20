import type { AppConfig } from "./schemas/config.schema.js";
import type { ToolDefinition } from "./schemas/tool.schema.js";

/**
 * Shared interface for channel adapters (re-exported by gateway).
 * Declared here so plugin types don't depend on the gateway package.
 */
export interface ChannelAdapterLike {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage?(channelId: string, text: string): Promise<void>;
  requestConfirmation?(
    channelId: string,
    prompt: string,
    timeoutMs?: number,
  ): Promise<{ approved: boolean; reason?: string }>;
}

export interface IncomingMessageLike {
  text: string;
  channelId: string;
  userId: string;
  messageId: string;
}

export interface StreamCallbacksLike {
  onTextDelta: (delta: string) => void;
  onToolCall: (toolName: string) => void;
  onFinish: (output: string) => void;
  onError: (error: Error) => void;
}

export type HandleMessageFnLike = (
  message: IncomingMessageLike,
  stream: StreamCallbacksLike,
) => Promise<void>;

/** Runtime context provided to every plugin during init(). */
export interface PluginContext {
  readonly config: AppConfig;
  readonly workspacePath: string;
  readonly rootDir: string;
  readonly registerTool: (tool: AnyToolDefinition) => void;
  readonly unregisterTool: (name: string) => void;
  readonly getAdapter: (prefix: string) => ChannelAdapterLike | undefined;
  readonly getAdapters: () => ChannelAdapterLike[];
  readonly log: (message: string) => void;
  readonly warn: (message: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolDefinition = ToolDefinition<any>;

/** A dashboard tab contributed by a plugin. */
export interface DashboardTab {
  /** Unique key — used in CSS class names and tab switching (e.g. "tasks"). */
  id: string;
  /** Display label shown in the tab nav bar. */
  label: string;
  /** HTML markup for the panel content (inserted into the layout grid).
   *  The root element MUST use the CSS class `{id}-panel` (e.g. `tasks-panel`)
   *  for the auto-generated show/hide rules to work. */
  panelHtml: string;
  /** Additional CSS rules (injected into the dashboard <style>). */
  css?: string;
  /** JS code block — function definitions, state variables (injected into <script>). */
  js?: string;
  /** JS expression called on first tab activation for lazy-loading (e.g. "loadTasks()"). */
  onActivate?: string;
}

/** Capabilities returned by a plugin's init(). */
export interface PluginCapabilities {
  tools?: AnyToolDefinition[];
  adapter?: ChannelAdapterLike;
  /** Hono sub-app for plugin-provided HTTP routes. Typed as `unknown` to avoid coupling core to hono. */
  routes?: unknown;
  routePrefix?: string;
  /** Dashboard tabs to register in the main dashboard UI. */
  dashboardTabs?: DashboardTab[];
}

/** Determines the order in which plugins are loaded. */
export type PluginPhase = "tools" | "adapters" | "routes" | "services";

/** Extended context available in afterInit() — includes the message handler. */
export interface PluginAfterInitContext extends PluginContext {
  handleMessage: HandleMessageFnLike;
  queuedHandleMessage: HandleMessageFnLike;
  /** Register an adapter during afterInit (for adapters that need handleMessage). */
  registerAdapter: (adapter: ChannelAdapterLike) => void;
}

/** The plugin contract. */
export interface Plugin {
  readonly name: string;
  readonly phase: PluginPhase;
  init(ctx: PluginContext): Promise<PluginCapabilities | null>;
  afterInit?(ctx: PluginAfterInitContext): Promise<void>;
  shutdown?(): Promise<void>;
}
