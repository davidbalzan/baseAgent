// Schemas
export { AppConfigSchema } from "./schemas/config.schema.js";
export { SessionStatusSchema, SessionUsageSchema, SessionSchema } from "./schemas/session.schema.js";
export { ToolCallSchema, ToolResultSchema } from "./schemas/tool.schema.js";
export { TracePhaseSchema, TraceEventSchema } from "./schemas/trace.schema.js";

// Types
export type {
  AppConfig,
  LlmProvider,
} from "./schemas/config.schema.js";
export type {
  Session,
  SessionStatus,
  SessionUsage,
} from "./schemas/session.schema.js";
export type {
  ToolDefinition,
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
export { resolveModel } from "./model/resolver.js";
export type { LanguageModel } from "ai";

// Loop
export { LoopEmitter } from "./loop/loop-events.js";
export type { LoopEventMap, SessionCompletePayload } from "./loop/loop-events.js";
export { createLoopState, updateUsage } from "./loop/loop-state.js";
export type { LoopState } from "./loop/loop-state.js";
export { runAgentLoop } from "./loop/agent-loop.js";
export type { AgentLoopOptions, AgentLoopResult } from "./loop/agent-loop.js";
export { compactMessages, persistCompactionSummary, decayToolOutputs } from "./loop/compaction.js";
export type { ToolMessageMeta } from "./loop/compaction.js";
