import type { ToolDefinition } from "@baseagent/core";
import type { SandboxContext } from "./types.js";
import { runMediumShell } from "./medium.js";
import { runStrictDocker } from "./strict.js";
import { createSafeEnv } from "../built-in/_utils.js";

/**
 * Dispatch tool execution through the appropriate sandbox level.
 *
 * Only intercepts exec-permission tools with a `command` argument.
 * Non-exec tools and loose mode pass through to `tool.execute()` directly.
 */
export async function applySandbox(
  tool: ToolDefinition,
  args: Record<string, unknown>,
  ctx: SandboxContext,
): Promise<string> {
  // Only sandbox exec-permission tools with a command arg
  if (tool.permission !== "exec" || typeof args.command !== "string") {
    return tool.execute(args);
  }

  // Loose mode — no interception
  if (ctx.level === "loose") {
    return tool.execute(args);
  }

  const command = args.command as string;
  const timeoutMs = (args.timeoutMs as number | undefined) ?? 30_000;

  if (ctx.level === "medium") {
    return runMediumShell({
      command,
      workspacePath: ctx.workspacePath,
      timeoutMs,
      env: createSafeEnv(),
      maxMemoryMb: ctx.maxMemoryMb,
      cpuCount: ctx.cpuCount,
      allowNetwork: ctx.allowNetwork,
      dockerImage: ctx.dockerImage,
    });
  }

  if (ctx.level === "strict") {
    return runStrictDocker({
      command,
      workspacePath: ctx.workspacePath,
      timeoutMs,
      dockerImage: ctx.dockerImage,
      maxMemoryMb: ctx.maxMemoryMb,
      cpuCount: ctx.cpuCount,
      allowNetwork: ctx.allowNetwork,
    });
  }

  // Fallback: unknown level — execute normally
  return tool.execute(args);
}
