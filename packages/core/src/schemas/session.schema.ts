import { z } from "zod";

export const SessionStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "timeout",
  "cost_limit",
]);

export const SessionUsageSchema = z.object({
  totalTokens: z.number().int().default(0),
  promptTokens: z.number().int().default(0),
  completionTokens: z.number().int().default(0),
  totalCostUsd: z.number().default(0),
  iterations: z.number().int().default(0),
});

export const SessionSchema = z.object({
  id: z.string().uuid(),
  status: SessionStatusSchema,
  channelId: z.string().optional(),
  input: z.string(),
  output: z.string().optional(),
  usage: SessionUsageSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type SessionUsage = z.infer<typeof SessionUsageSchema>;
export type Session = z.infer<typeof SessionSchema>;
