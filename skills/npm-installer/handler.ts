import { z } from "zod";
import { execFile } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { ToolDefinition } from "@baseagent/core";

const MAX_TIMEOUT_MS = 600_000; // 10 minutes for complex installations
const DEFAULT_TIMEOUT_MS = 180_000; // 3 minutes default

/**
 * Enhanced npm artifact installation tool using pnpm
 * Provides comprehensive package management with advanced features
 */
const parameters = z.object({
  packages: z
    .array(z.string())
    .min(1)
    .describe("Array of npm package names with optional versions (e.g. ['react@^18.0.0', '@types/node', 'lodash@latest'])"),
  
  operation: z
    .enum(["install", "update", "remove", "info", "outdated", "audit"])
    .default("install")
    .describe("Package operation to perform: install, update, remove, info, outdated, or audit"),
  
  dev: z
    .boolean()
    .optional()
    .default(false)
    .describe("Install as dev dependencies (--save-dev)"),
  
  workspace: z
    .string()
    .optional()
    .describe("Target workspace package (e.g. 'packages/core', 'packages/tools'). If not specified, uses project root"),
  
  global: z
    .boolean()
    .optional()
    .default(false)
    .describe("Install packages globally (--global)"),
  
  exact: z
    .boolean()
    .optional()
    .default(false)
    .describe("Install exact versions (--save-exact)"),
  
  peer: z
    .boolean()
    .optional()
    .default(false)
    .describe("Install as peer dependencies (--save-peer)"),
  
  optional: z
    .boolean()
    .optional()
    .default(false)
    .describe("Install as optional dependencies (--save-optional)"),
  
  frozen: z
    .boolean()
    .optional()
    .default(false)
    .describe("Use frozen lockfile (--frozen-lockfile) - fails if lockfile is out of date"),
  
  shamefully: z
    .boolean()
    .optional()
    .default(false)
    .describe("Use shamefully-hoist for compatibility (--shamefully-hoist)"),
  
  interactive: z
    .boolean()
    .optional()
    .default(false)
    .describe("Show interactive package selection (--interactive)"),
  
  dryRun: z
    .boolean()
    .optional()
    .default(false)
    .describe("Show what would be installed without actually installing (--dry-run)"),
  
  production: z
    .boolean()
    .optional()
    .default(false)
    .describe("Install only production dependencies (--prod)"),
  
  verbose: z
    .boolean()
    .optional()
    .default(false)
    .describe("Show verbose output (--verbose)"),
  
  registry: z
    .string()
    .optional()
    .describe("Custom npm registry URL (--registry)"),
  
  filter: z
    .string()
    .optional()
    .describe("Filter packages in workspace (--filter), e.g. 'packages/core' or '@baseagent/*'"),
  
  timeoutMs: z
    .number()
    .int()
    .min(30_000)
    .max(MAX_TIMEOUT_MS)
    .optional()
    .default(DEFAULT_TIMEOUT_MS)
    .describe(`Operation timeout in milliseconds (default ${DEFAULT_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS})`),
});

/**
 * Create a safe environment for pnpm execution
 */
function createSafeEnv(): Record<string, string> {
  const allowedEnvVars = [
    'PATH', 'HOME', 'USER', 'NODE_PATH', 'npm_config_cache',
    'PNPM_HOME', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
    'SHELL', 'TERM', 'LANG', 'LC_ALL', 'TZ'
  ];
  
  const env: Record<string, string> = {};
  for (const key of allowedEnvVars) {
    if (process.env[key]) {
      env[key] = process.env[key]!;
    }
  }
  
  return env;
}

/**
 * Check if pnpm is available
 */
async function checkPnpmAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('pnpm', ['--version'], (error) => {
      resolve(!error);
    });
  });
}

/**
 * Get workspace information
 */
async function getWorkspaceInfo(rootPath: string): Promise<{ workspaces: string[], isWorkspace: boolean }> {
  try {
    // Check for pnpm-workspace.yaml
    const workspaceFile = join(rootPath, 'pnpm-workspace.yaml');
    await access(workspaceFile);
    
    const content = await readFile(workspaceFile, 'utf-8');
    const workspaceMatch = content.match(/packages:\s*\n([\s\S]*?)(?:\n\S|$)/);
    
    if (workspaceMatch) {
      const workspaces = workspaceMatch[1]
        .split('\n')
        .map(line => line.trim().replace(/^-\s*['"]?([^'"]*?)['"]?$/, '$1'))
        .filter(line => line && !line.startsWith('#'));
      
      return { workspaces, isWorkspace: true };
    }
  } catch (error) {
    // Not a workspace or file doesn't exist
  }
  
  return { workspaces: [], isWorkspace: false };
}

/**
 * Validate workspace path
 */
async function validateWorkspace(rootPath: string, workspace: string): Promise<boolean> {
  try {
    const workspacePath = join(rootPath, workspace);
    const packageJsonPath = join(workspacePath, 'package.json');
    await access(packageJsonPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Enhanced npm artifact installer tool
 */
const tool: ToolDefinition<typeof parameters> = {
    name: "npm_installer",
    description: 
      "Enhanced npm package installer using pnpm with comprehensive features. " +
      "Supports all pnpm operations: install, update, remove, info, outdated, audit. " +
      "Includes workspace management, dependency types (dev, peer, optional), " +
      "frozen lockfiles, dry-run mode, custom registries, and advanced filtering. " +
      "Perfect for managing complex monorepo setups and CI/CD pipelines.",
    
    parameters,
    permission: "exec",
    timeoutMs: 300_000, // 5 minute tool timeout
    maxOutputChars: 100_000,
    
    execute: async (args) => {
      // Check if pnpm is available
      if (!(await checkPnpmAvailable())) {
        return "[error] pnpm is not installed or not available in PATH. Please install pnpm first.";
      }

      // For skills, we need to determine the workspace path
      // Use the current working directory as the project root
      const projectRootPath = process.cwd();
      let cwd = projectRootPath;
      
      if (args.workspace) {
        const workspacePath = join(projectRootPath, args.workspace);
        
        if (!(await validateWorkspace(projectRootPath, args.workspace))) {
          return `[error] Workspace '${args.workspace}' does not exist or is not a valid package directory.`;
        }
        
        cwd = workspacePath;
      }

      // Get workspace info for context
      const workspaceInfo = await getWorkspaceInfo(projectRootPath);
      
      // Build pnpm command arguments
      const pnpmArgs: string[] = [];
      
      // Main operation
      switch (args.operation) {
        case "install":
          pnpmArgs.push("add");
          break;
        case "update":
          pnpmArgs.push("update");
          break;
        case "remove":
          pnpmArgs.push("remove");
          break;
        case "info":
          pnpmArgs.push("info");
          break;
        case "outdated":
          pnpmArgs.push("outdated");
          break;
        case "audit":
          pnpmArgs.push("audit");
          break;
      }
      
      // Add flags based on operation
      if (args.operation === "install" || args.operation === "update") {
        if (args.dev) pnpmArgs.push("--save-dev");
        if (args.peer) pnpmArgs.push("--save-peer");
        if (args.optional) pnpmArgs.push("--save-optional");
        if (args.exact) pnpmArgs.push("--save-exact");
        if (args.production) pnpmArgs.push("--prod");
        if (args.frozen) pnpmArgs.push("--frozen-lockfile");
        if (args.shamefully) pnpmArgs.push("--shamefully-hoist");
      }
      
      // Global and common flags
      if (args.global) pnpmArgs.push("--global");
      if (args.dryRun) pnpmArgs.push("--dry-run");
      if (args.verbose) pnpmArgs.push("--verbose");
      if (args.interactive && args.operation === "install") pnpmArgs.push("--interactive");
      if (args.registry) pnpmArgs.push("--registry", args.registry);
      if (args.filter) pnpmArgs.push("--filter", args.filter);
      
      // Add packages for relevant operations
      if (["install", "update", "remove", "info"].includes(args.operation)) {
        pnpmArgs.push(...args.packages);
      }

      const safeEnv = createSafeEnv();

      // Build command description for logging
      const workspaceTag = args.workspace ? ` [${args.workspace}]` : "";
      const operationTag = ` [${args.operation}]`;
      const typeTag = args.dev ? " [dev]" : args.peer ? " [peer]" : args.optional ? " [optional]" : "";
      const flagTags = [
        args.global ? "[global]" : "",
        args.exact ? "[exact]" : "",
        args.frozen ? "[frozen]" : "",
        args.dryRun ? "[dry-run]" : "",
        args.production ? "[prod-only]" : "",
        args.verbose ? "[verbose]" : ""
      ].filter(Boolean).join(" ");
      
      const fullCommand = `pnpm ${pnpmArgs.join(" ")}`;
      
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
            maxBuffer: 5 * 1024 * 1024, // 5 MB buffer for large outputs
          },
          (error, stdout, stderr) => {
            clearTimeout(timer);

            if (error && error.killed) {
              resolve(`[exit: timeout]${workspaceTag}${operationTag}\nOperation timed out after ${args.timeoutMs}ms\nCommand: ${fullCommand}`);
              return;
            }

            const exitCode = error?.code ?? 0;
            const tags = `${workspaceTag}${operationTag}${typeTag} ${flagTags}`.trim();
            
            let output = `[exit: ${exitCode}]${tags ? ` ${tags}` : ""}\nCommand: ${fullCommand}\n`;
            
            // Add workspace context if available
            if (workspaceInfo.isWorkspace && workspaceInfo.workspaces.length > 0) {
              output += `Workspace: ${workspaceInfo.isWorkspace ? "Yes" : "No"} (${workspaceInfo.workspaces.length} packages)\n`;
            }
            
            if (exitCode === 0) {
              const packageList = args.packages.length > 0 ? args.packages.join(", ") : "all packages";
              output += `\n✅ Operation completed successfully`;
              
              if (args.operation === "install") {
                output += `: ${packageList}`;
              } else if (args.operation === "remove") {
                output += `: removed ${packageList}`;
              } else if (args.operation === "update") {
                output += `: updated ${packageList}`;
              }
              
              output += `\n\n${stdout}`;
              
              if (stderr) {
                output += `\n[warnings]\n${stderr}`;
              }
            } else {
              output += `\n❌ Operation failed`;
              
              if (args.packages.length > 0) {
                output += ` for packages: ${args.packages.join(", ")}`;
              }
              
              output += `\n\n${stdout}`;
              
              if (stderr) {
                output += `\n[error details]\n${stderr}`;
              }
            }
            
            resolve(output);
          }
        );
      });
    },
};

export default tool;