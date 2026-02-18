import type { AppConfig, SandboxLevel } from "@baseagent/core";
import type { SandboxContext } from "./types.js";

/**
 * Resolve the sandbox level for a given tool.
 * Per-tool overrides take precedence over the default level.
 * When no sandbox config exists, returns "loose" (backward compatible).
 */
export function resolveSandboxLevel(
  toolName: string,
  config: AppConfig,
): SandboxLevel {
  const sandbox = config.sandbox;
  if (!sandbox) return "loose";
  return sandbox.toolOverrides?.[toolName] ?? sandbox.defaultLevel;
}

/**
 * Build a full SandboxContext for a tool invocation.
 * When no sandbox config exists, returns a loose context (no restrictions).
 */
export function buildSandboxContext(
  toolName: string,
  workspacePath: string,
  config: AppConfig,
): SandboxContext {
  const level = resolveSandboxLevel(toolName, config);
  const sandbox = config.sandbox;

  // Default allowNetwork: true for medium, false for strict
  const allowNetwork =
    sandbox?.allowNetwork ?? (level === "strict" ? false : true);

  return {
    level,
    workspacePath,
    dockerImage: sandbox?.dockerImage ?? "alpine:3.19",
    maxMemoryMb: sandbox?.maxMemoryMb ?? 256,
    cpuCount: sandbox?.cpuCount ?? 0.5,
    allowNetwork,
  };
}
