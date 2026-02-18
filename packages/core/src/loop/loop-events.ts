import { EventEmitter } from "node:events";
import type { TraceEvent } from "../schemas/trace.schema.js";
import type { ToolCall, ToolResult } from "../schemas/tool.schema.js";
import type { LoopState } from "./loop-state.js";
import type { ToolMessageMeta } from "./compaction.js";
import type { CoreMessage } from "ai";

export interface SessionCompletePayload {
  sessionId: string;
  output: string;
  state: LoopState;
  messages: CoreMessage[];
  toolMessageMeta: ToolMessageMeta[];
}

export interface LoopEventMap {
  text_delta: [delta: string];
  tool_call: [call: ToolCall];
  tool_result: [result: ToolResult];
  trace: [event: TraceEvent];
  finish: [output: string];
  session_complete: [result: SessionCompletePayload];
  error: [error: Error];
}

export class LoopEmitter extends EventEmitter<LoopEventMap> {}
