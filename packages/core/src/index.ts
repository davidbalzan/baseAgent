// Schemas
export { AppConfigSchema } from "./schemas/config.schema.js";
export { SessionStatusSchema, SessionUsageSchema, SessionSchema } from "./schemas/session.schema.js";
export { ToolCallSchema, ToolResultSchema, ToolPermissionSchema } from "./schemas/tool.schema.js";
export { TracePhaseSchema, TraceEventSchema } from "./schemas/trace.schema.js";

// Types
export type {
  AppConfig,
  LlmProvider,
  SandboxLevel,
  SandboxConfig,
  WebhookConfig,
  McpConfig,
  McpServerConfig,
  UserLink,
} from "./schemas/config.schema.js";
export type {
  Session,
  SessionStatus,
  SessionUsage,
} from "./schemas/session.schema.js";
export type {
  ToolDefinition,
  ToolPermission,
  ToolCall,
  ToolResult,
} from "./schemas/tool.schema.js";
export type {
  TraceEvent,
  TracePhase,
} from "./schemas/trace.schema.js";

// Config
export { loadConfig } from "./config/loader.js";

// Model
export { resolveModel, resolveSingleModel } from "./model/resolver.js";
export { createFallbackModel } from "./model/fallback-model.js";
export type { FallbackCallback } from "./model/fallback-model.js";
export { fetchOpenRouterPricing } from "./model/openrouter-pricing.js";
export { selectModel } from "./model/model-selector.js";
export type { ModelOption, ModelSelectionResult } from "./model/model-selector.js";
export type { LanguageModel, CoreMessage } from "ai";

// Loop
export { LoopEmitter } from "./loop/loop-events.js";
export type { LoopEventMap, SessionCompletePayload } from "./loop/loop-events.js";
export { createLoopState, updateUsage } from "./loop/loop-state.js";
export type { LoopState, ModelPricing } from "./loop/loop-state.js";
export { runAgentLoop } from "./loop/agent-loop.js";
export type { AgentLoopOptions, AgentLoopResult } from "./loop/agent-loop.js";
export { compactMessages, persistCompactionSummary, decayToolOutputs } from "./loop/compaction.js";
export type { ToolMessageMeta } from "./loop/compaction.js";
export {
  INJECTION_DEFENSE_PREAMBLE,
  INJECTION_DEFENSE_PREAMBLE_COMPACT,
  wrapUserInput,
  detectInjectionAttempt,
  detectSystemPromptLeakage,
  sanitizeStringArg,
} from "./loop/injection-defense.js";

// Logger
export { createLogger } from "./logger.js";
export type { Logger } from "./logger.js";

// Plugin system
export type {
  Plugin,
  PluginContext,
  PluginCapabilities,
  PluginPhase,
  PluginAfterInitContext,
  DashboardTab,
  PluginDoc,
  ChannelAdapterLike,
  HandleMessageFnLike,
  IncomingMessageLike,
  StreamCallbacksLike,
} from "./plugin.js";
