import { resolve } from "node:path";
import type { Plugin, PluginContext, PluginCapabilities } from "@baseagent/core";
import type { ToolDefinition } from "@baseagent/core";
import {
  finishTool,
  createAddMcpServerTool,
  createMemoryReadTool,
  createMemoryWriteTool,
  createFileReadTool,
  createFileWriteTool,
  createFileEditTool,
  createFileListTool,
  createShellExecTool,
  createWebFetchTool,
  loadSkills,
  loadMcpServers,
  closeMcpServers,
  ToolRegistry,
  type McpServerHandle,
} from "@baseagent/tools";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolDefinition = ToolDefinition<any>;

export interface BuiltInToolsPluginDeps {
  registry: ToolRegistry;
  configPath: string;
}

export function createBuiltInToolsPlugin(deps: BuiltInToolsPluginDeps): Plugin {
  const mcpHandles: McpServerHandle[] = [];

  return {
    name: "built-in-tools",
    phase: "tools",

    async init(ctx: PluginContext): Promise<PluginCapabilities | null> {
      const tools: AnyToolDefinition[] = [];

      // Core tools
      tools.push(finishTool);
      tools.push(createMemoryReadTool(ctx.workspacePath));
      tools.push(createMemoryWriteTool(ctx.workspacePath));
      tools.push(createFileReadTool(ctx.workspacePath));
      tools.push(createFileWriteTool(ctx.workspacePath));
      tools.push(createFileEditTool(ctx.workspacePath));
      tools.push(createFileListTool(ctx.workspacePath));
      tools.push(createShellExecTool(ctx.workspacePath));
      tools.push(createWebFetchTool());

      ctx.log(`[tools] Built-in: ${tools.map((t) => t.name).join(", ")}`);

      // Load skills
      const skillsDir = resolve(ctx.rootDir, "skills");
      const skillResult = await loadSkills(skillsDir, { workspacePath: ctx.workspacePath });
      for (const tool of skillResult.tools) {
        tools.push(tool);
      }
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

      // Register add_mcp_server tool (wired to the live registry + handles)
      tools.push(createAddMcpServerTool({
        registry: deps.registry,
        mcpHandles,
        configPath: deps.configPath,
      }));

      return { tools };
    },

    async shutdown(): Promise<void> {
      await closeMcpServers(mcpHandles);
    },
  };
}
