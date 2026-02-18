import { EventEmitter } from "node:events";
import type { TraceEvent } from "../schemas/trace.schema.js";
import type { ToolCall, ToolResult } from "../schemas/tool.schema.js";

export interface LoopEventMap {
  text_delta: [delta: string];
  tool_call: [call: ToolCall];
  tool_result: [result: ToolResult];
  trace: [event: TraceEvent];
  finish: [output: string];
  error: [error: Error];
}

export class LoopEmitter extends EventEmitter<LoopEventMap> {}
