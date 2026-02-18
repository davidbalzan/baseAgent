import { z } from "zod";

export const ToolPermissionSchema = z.enum(["read", "write", "exec"]);
export type ToolPermission = z.infer<typeof ToolPermissionSchema>;

export interface ToolDefinition<TParams extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  parameters: TParams;
  execute: (args: z.infer<TParams>) => Promise<string>;
  timeoutMs?: number;
  maxOutputChars?: number;
  permission?: ToolPermission;
}

export const ToolCallSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.unknown()),
});

export const ToolResultSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  result: z.string(),
  error: z.string().optional(),
  durationMs: z.number(),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;
