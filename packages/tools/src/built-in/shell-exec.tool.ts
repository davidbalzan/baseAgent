import { z } from "zod";
import { execFile } from "node:child_process";
import type { ToolDefinition } from "@baseagent/core";
import { createSafeEnv } from "./_utils.js";

const MAX_TIMEOUT_MS = 120_000;
const DEFAULT_TIMEOUT_MS = 30_000;

const parameters = z.object({
  command: z
    .string()
    .describe("The shell command to execute."),
  timeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(MAX_TIMEOUT_MS)
    .optional()
    .default(DEFAULT_TIMEOUT_MS)
    .describe(`Command timeout in milliseconds (default ${DEFAULT_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS}).`),
});

export function createShellExecTool(workspacePath: string): ToolDefinition<typeof parameters> {
  return {
    name: "shell_exec",
    description:
      "Execute a shell command in the workspace directory. Runs with a filtered environment (no API keys exposed). Use for system info, builds, git, package managers, scripts, or any CLI task.",
    parameters,
    permission: "exec",
    timeoutMs: 60_000,
    maxOutputChars: 20_000,
    execute: async (args) => {
      const safeEnv = createSafeEnv();

      return new Promise<string>((resolve) => {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), args.timeoutMs);

        execFile(
          "/bin/sh",
          ["-c", args.command],
          {
            cwd: workspacePath,
            env: safeEnv,
            signal: ac.signal,
            maxBuffer: 1024 * 1024, // 1 MB
          },
          (error, stdout, stderr) => {
            clearTimeout(timer);

            if (error && error.killed) {
              resolve(`[exit: timeout]\nCommand timed out after ${args.timeoutMs}ms`);
              return;
            }

            const exitCode = error?.code ?? 0;
            let output = `[exit: ${exitCode}]\n${stdout}`;
            if (stderr) {
              output += `\n[stderr]\n${stderr}`;
            }
            resolve(output);
          },
        );
      });
    },
  };
}
