import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import type { Plugin, PluginContext, PluginCapabilities } from "@baseagent/core";
import type { ToolDefinition } from "@baseagent/core";
import {
  finishTool,
  thinkTool,
  createAddMcpServerTool,
  createInstallPluginTool,
  createListPluginsTool,
  createRemovePluginTool,
  createMemoryReadTool,
  createMemoryWriteTool,
  createHeartbeatRegisterTool,
  createFileReadTool,
  createFileWriteTool,
  createFileEditTool,
  createFileListTool,
  createShellExecTool,
  createPnpmInstallTool,
  createWebFetchTool,
  createWebSearchTool,
  createSessionSearchTool,
  createReviewSessionsTool,
  loadSkills,
  loadMcpServers,
  closeMcpServers,
  ToolRegistry,
  type McpServerHandle,
  type SessionSearchFn,
  type ListRecentSessionsFn,
} from "@baseagent/tools";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolDefinition = ToolDefinition<any>;

export interface BuiltInToolsPluginDeps {
  registry: ToolRegistry;
  configPath: string;
  sessionSearchFn?: SessionSearchFn;
  listRecentSessionsFn?: ListRecentSessionsFn;
}

export function createBuiltInToolsPlugin(deps: BuiltInToolsPluginDeps): Plugin {
  const mcpHandles: McpServerHandle[] = [];
  /** Names of currently loaded skills (for unregister on reload). */
  let loadedSkillNames: string[] = [];
  /** Saved for reload. */
  let savedCtx: PluginContext | null = null;

  async function doLoadSkills(ctx: PluginContext): Promise<{ loaded: string[]; failed: { name: string; error: string }[] }> {
    const skillsDir = resolve(ctx.rootDir, "skills");
    const skillResult = await loadSkills(skillsDir, { workspacePath: ctx.workspacePath });

    // Unregister old skills
    for (const name of loadedSkillNames) {
      ctx.unregisterTool(name);
    }

    // Register new skills
    for (const tool of skillResult.tools) {
      ctx.registerTool(tool);
    }
    loadedSkillNames = skillResult.loaded;

    if (skillResult.loaded.length > 0) {
      ctx.log(`[skills] Loaded: ${skillResult.loaded.join(", ")}`);
    }
    for (const f of skillResult.failed) {
      ctx.warn(`[skills] Failed to load "${f.name}": ${f.error}`);
    }

    return { loaded: skillResult.loaded, failed: skillResult.failed };
  }

  return {
    name: "built-in-tools",
    phase: "tools",

    async init(ctx: PluginContext): Promise<PluginCapabilities | null> {
      savedCtx = ctx;
      const tools: AnyToolDefinition[] = [];

      // Core tools
      tools.push(finishTool);
      tools.push(thinkTool);
      tools.push(createMemoryReadTool(ctx.workspacePath));
      tools.push(createMemoryWriteTool(ctx.workspacePath));
      tools.push(createHeartbeatRegisterTool(ctx.workspacePath));
      tools.push(createFileReadTool(ctx.workspacePath, ctx.rootDir));
      tools.push(createFileWriteTool(ctx.workspacePath));
      tools.push(createFileEditTool(ctx.workspacePath));
      tools.push(createFileListTool(ctx.workspacePath, ctx.rootDir));
      tools.push(createShellExecTool(ctx.workspacePath, ctx.rootDir));
      tools.push(createPnpmInstallTool(ctx.workspacePath, ctx.rootDir));
      tools.push(createWebFetchTool());
      if (process.env.BRAVE_SEARCH_API_KEY) {
        tools.push(createWebSearchTool());
      } else {
        ctx.warn("[tools] web_search disabled — BRAVE_SEARCH_API_KEY not set");
      }

      if (deps.sessionSearchFn) {
        tools.push(createSessionSearchTool(deps.sessionSearchFn));
      }

      if (deps.listRecentSessionsFn) {
        tools.push(createReviewSessionsTool(deps.listRecentSessionsFn));
      }

      ctx.log(`[tools] Built-in: ${tools.map((t) => t.name).join(", ")}`);

      // Load skills
      const skillsDir = resolve(ctx.rootDir, "skills");
      const skillResult = await loadSkills(skillsDir, { workspacePath: ctx.workspacePath });
      for (const tool of skillResult.tools) {
        tools.push(tool);
      }
      loadedSkillNames = skillResult.loaded;
      if (skillResult.loaded.length > 0) {
        ctx.log(`[skills] Loaded: ${skillResult.loaded.join(", ")}`);
      }
      for (const f of skillResult.failed) {
        ctx.warn(`[skills] Failed to load "${f.name}": ${f.error}`);
      }

      // Load MCP servers
      if (ctx.config.mcp?.servers?.length) {
        const mcpResult = await loadMcpServers(ctx.config.mcp.servers);
        for (const handle of mcpResult.handles) {
          for (const tool of handle.tools) {
            tools.push(tool);
          }
          mcpHandles.push(handle);
        }
        if (mcpResult.loaded.length > 0) {
          ctx.log(`[mcp] Connected: ${mcpResult.loaded.join(", ")}`);
          const toolNames = mcpHandles.flatMap((h) => h.tools.map((t) => t.name));
          ctx.log(`[mcp] Tools registered: ${toolNames.join(", ")}`);
        }
        for (const f of mcpResult.failed) {
          ctx.warn(`[mcp] Failed "${f.name}": ${f.error}`);
        }
      }

      // Register MCP / plugin management tools (wired to the live registry + handles)
      const mcpCtx = {
        registry: deps.registry,
        mcpHandles,
        configPath: deps.configPath,
      };
      tools.push(createAddMcpServerTool(mcpCtx));
      tools.push(createInstallPluginTool(mcpCtx));
      tools.push(createListPluginsTool({ mcpHandles, configPath: deps.configPath }));
      tools.push(createRemovePluginTool(mcpCtx));

      // reload_skills tool — hot-reload skills without server restart
      const reloadSkillsTool: AnyToolDefinition = {
        name: "reload_skills",
        description: "Hot-reload all skills from the skills/ directory without restarting the server. " +
          "Use this after creating or modifying a skill with create_skill. " +
          "This tool also validates skills via TypeScript by default.",
        parameters: z.object({
          verifyTypecheck: z
            .boolean()
            .optional()
            .default(true)
            .describe("Run `pnpm exec tsc --noEmit` in skills/ after reload."),
        }),
        permission: "exec" as const,
        async execute(args) {
          if (!savedCtx) return "Error: Plugin context not available.";
          const result = await doLoadSkills(savedCtx);
          let typecheckPassed = true;
          let typecheckSummary = "";

          if (args.verifyTypecheck) {
            const typecheck = spawnSync("pnpm", ["exec", "tsc", "--noEmit"], {
              cwd: resolve(savedCtx.rootDir, "skills"),
              encoding: "utf-8",
            });
            typecheckPassed = typecheck.status === 0;

            if (typecheckPassed) {
              typecheckSummary = "Skills typecheck: passed.";
            } else {
              const stderr = (typecheck.stderr ?? "").trim();
              const stdout = (typecheck.stdout ?? "").trim();
              const details = (stderr || stdout || "Unknown typecheck failure").slice(0, 1200);
              typecheckSummary = `Skills typecheck: failed. ${details}`;
            }
          }

          const summary = result.loaded.length > 0
            ? `Loaded: ${result.loaded.join(", ")}`
            : "No skills loaded";
          const failures = result.failed.length > 0
            ? `. Failed: ${result.failed.map((f) => `${f.name} (${f.error})`).join(", ")}`
            : "";

          const validationFailed = result.failed.length > 0 || !typecheckPassed;
          const validationPrefix = validationFailed
            ? "[reload_skills validation_failed] "
            : "Skills reloaded successfully. ";

          const runbook = validationFailed
            ? "Fix reported issues, then call reload_skills again. Do not claim skill success yet."
            : "Validation gate passed: reload + typecheck are clean.";

          return `${validationPrefix}${summary}${failures}${typecheckSummary ? `. ${typecheckSummary}` : ""} ${runbook}`;
        },
      };
      tools.push(reloadSkillsTool);

      return { tools };
    },

    async shutdown(): Promise<void> {
      await closeMcpServers(mcpHandles);
    },
  };
}

/** Build a reloadSkills function for the dashboard API. */
export function createSkillReloader(ctx: PluginContext, registry: ToolRegistry): () => Promise<{ loaded: string[]; failed: { name: string; error: string }[] }> {
  let loadedNames: string[] = [];
  return async () => {
    const skillsDir = resolve(ctx.rootDir, "skills");
    const result = await loadSkills(skillsDir, { workspacePath: ctx.workspacePath });
    for (const name of loadedNames) {
      ctx.unregisterTool(name);
    }
    for (const tool of result.tools) {
      ctx.registerTool(tool);
    }
    loadedNames = result.loaded;
    return { loaded: result.loaded, failed: result.failed };
  };
}
