import { z } from "zod";

export const TracePhaseSchema = z.enum([
  "session_start",
  "reason",
  "tool_call",
  "tool_result",
  "observe",
  "compaction",
  "finish",
  "error",
  "governance",
  "model_fallback",
  "narration_nudge",
]);

export const TraceEventSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  phase: TracePhaseSchema,
  iteration: z.number().int(),
  data: z.record(z.unknown()).optional(),
  promptTokens: z.number().int().optional(),
  completionTokens: z.number().int().optional(),
  costUsd: z.number().optional(),
  timestamp: z.string().datetime(),
});

export type TracePhase = z.infer<typeof TracePhaseSchema>;
export type TraceEvent = z.infer<typeof TraceEventSchema>;
