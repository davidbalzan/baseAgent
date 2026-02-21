import { z } from "zod";
import { execFile } from "node:child_process";
import type { ToolDefinition } from "@baseagent/core";
import { createSafeEnv } from "./_utils.js";

const MAX_TIMEOUT_MS = 300_000; // 5 minutes for pnpm install
const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes default

const parameters = z.object({
  packages: z
    .array(z.string())
    .min(1)
    .describe("Array of npm package names to install (e.g. ['react', '@types/node', 'lodash@^4.17.0'])."),
  dev: z
    .boolean()
    .optional()
    .default(false)
    .describe("Install as dev dependencies (equivalent to --save-dev)."),
  workspace: z
    .string()
    .optional()
    .describe("Install in specific workspace package (e.g. 'packages/core', 'packages/tools'). If not specified, installs in project root."),
  global: z
    .boolean()
    .optional()
    .default(false)
    .describe("Install packages globally (equivalent to --global)."),
  exact: z
    .boolean()
    .optional()
    .default(false)
    .describe("Install exact versions (equivalent to --save-exact)."),
  peer: z
    .boolean()
    .optional()
    .default(false)
    .describe("Install as peer dependencies (equivalent to --save-peer)."),
  optional: z
    .boolean()
    .optional()
    .default(false)
    .describe("Install as optional dependencies (equivalent to --save-optional)."),
  timeoutMs: z
    .number()
    .int()
    .min(10_000)
    .max(MAX_TIMEOUT_MS)
    .optional()
    .default(DEFAULT_TIMEOUT_MS)
    .describe(`Installation timeout in milliseconds (default ${DEFAULT_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS}).`),
});

export function createPnpmInstallTool(workspacePath: string, projectRootPath?: string): ToolDefinition<typeof parameters> {
  return {
    name: "pnpm_install",
    description:
      "Install npm packages using pnpm. Supports dev dependencies, workspace-specific installs, global installs, " +
      "and exact version pinning. Runs in the project root by default for proper workspace resolution. " +
      "Examples: Install react: ['react']. Install dev deps: packages=['@types/node'], dev=true. " +
      "Install in specific workspace: packages=['lodash'], workspace='packages/core'.",
    parameters,
    permission: "exec",
    timeoutMs: 180_000, // 3 minute tool timeout (separate from command timeout)
    maxOutputChars: 50_000,
    execute: async (args) => {
      // Determine working directory
      const cwd = args.workspace
        ? `${projectRootPath ?? workspacePath}/${args.workspace}`
        : (projectRootPath ?? workspacePath);

      // Build pnpm command arguments
      const pnpmArgs = ["add"];
      
      if (args.dev) pnpmArgs.push("--save-dev");
      if (args.global) pnpmArgs.push("--global");
      if (args.exact) pnpmArgs.push("--save-exact");
      if (args.peer) pnpmArgs.push("--save-peer");
      if (args.optional) pnpmArgs.push("--save-optional");
      
      // Add packages to install
      pnpmArgs.push(...args.packages);

      const safeEnv = createSafeEnv();

      // Build command description for logging
      const workspaceTag = args.workspace ? ` [${args.workspace}]` : "";
      const typeTag = args.dev ? " [dev]" : args.peer ? " [peer]" : args.optional ? " [optional]" : "";
      const globalTag = args.global ? " [global]" : "";
      const exactTag = args.exact ? " [exact]" : "";
      
      return new Promise<string>((resolve) => {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), args.timeoutMs);

        execFile(
          "pnpm",
          pnpmArgs,
          {
            cwd,
            env: safeEnv,
            signal: ac.signal,
            maxBuffer: 2 * 1024 * 1024, // 2 MB buffer for pnpm output
          },
          (error, stdout, stderr) => {
            clearTimeout(timer);

            if (error && error.killed) {
              resolve(`[exit: timeout]${workspaceTag}\nInstallation timed out after ${args.timeoutMs}ms`);
              return;
            }

            const exitCode = error?.code ?? 0;
            const tags = `${workspaceTag}${typeTag}${globalTag}${exactTag}`;
            
            if (exitCode === 0) {
              const packageList = args.packages.join(", ");
              let output = `[exit: ${exitCode}]${tags}\nSuccessfully installed: ${packageList}\n${stdout}`;
              if (stderr) {
                output += `\n[stderr]\n${stderr}`;
              }
              resolve(output);
            } else {
              let output = `[exit: ${exitCode}]${tags}\nFailed to install packages: ${args.packages.join(", ")}\n${stdout}`;
              if (stderr) {
                output += `\n[stderr]\n${stderr}`;
              }
              resolve(output);
            }
          },
        );
      });
    },
  };
}