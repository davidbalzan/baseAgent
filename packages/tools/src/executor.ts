import type { ToolDefinition } from "@baseagent/core";
import type { SandboxContext } from "./sandbox/types.js";
import { applySandbox } from "./sandbox/apply.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_CHARS = 10_000;

interface ToolExecResult {
  result: string;
  error?: string;
  durationMs: number;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `\n\n[...truncated at ${maxChars} chars]`;
}

export async function executeTool(
  tool: ToolDefinition,
  args: Record<string, unknown>,
  sandboxCtx?: SandboxContext,
): Promise<ToolExecResult> {
  const timeoutMs = tool.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputChars = tool.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
  const start = Date.now();

  try {
    // Validate args
    const parsed = tool.parameters.safeParse(args);
    if (!parsed.success) {
      return {
        result: "",
        error: `Invalid arguments: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        durationMs: Date.now() - start,
      };
    }

    // Execute with timeout — route through sandbox if context provided
    const resultPromise = sandboxCtx
      ? applySandbox(tool, parsed.data, sandboxCtx)
      : tool.execute(parsed.data);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Tool "${tool.name}" timed out after ${timeoutMs}ms`)), timeoutMs),
    );

    const raw = await Promise.race([resultPromise, timeoutPromise]);
    const result = truncate(String(raw), maxOutputChars);

    return { result, durationMs: Date.now() - start };
  } catch (err) {
    return {
      result: "",
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

export function createToolExecutor(
  getToolFn: (name: string) => ToolDefinition | undefined,
  getSandboxCtx?: (toolName: string) => SandboxContext | undefined,
): (name: string, args: Record<string, unknown>) => Promise<ToolExecResult> {
  return async (name, args) => {
    const tool = getToolFn(name);
    if (!tool) {
      return {
        result: "",
        error: `Unknown tool: "${name}"`,
        durationMs: 0,
      };
    }
    const sandboxCtx = getSandboxCtx?.(name);
    return executeTool(tool, args, sandboxCtx);
  };
}
