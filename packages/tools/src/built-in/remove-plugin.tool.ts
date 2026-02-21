import { readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import type { ToolDefinition } from "@baseagent/core";
import type { ToolRegistry } from "../registry.js";
import type { McpServerHandle } from "../mcp-loader.js";

export interface RemovePluginContext {
  registry: ToolRegistry;
  mcpHandles: McpServerHandle[];
  configPath: string;
}

const parameters = z.object({
  name: z.string().describe("Name of the plugin to remove (as shown by list_plugins)."),
});

export function createRemovePluginTool(ctx: RemovePluginContext): ToolDefinition<typeof parameters> {
  return {
    name: "remove_plugin",
    description:
      "Remove an installed plugin. Disconnects the MCP server, unregisters its tools, " +
      "and removes it from the config so it won't reconnect on restart.",
    parameters,
    permission: "write",
    execute: async (args) => {
      // 1. Find handle
      const index = ctx.mcpHandles.findIndex((h) => h.name === args.name);
      if (index === -1) {
        return `Plugin "${args.name}" is not installed. Use list_plugins to see available plugins.`;
      }

      const handle = ctx.mcpHandles[index];
      const unregistered: string[] = [];

      // 2. Close the MCP client
      try {
        await handle.client.close();
      } catch {
        // Best-effort close — continue with cleanup
      }

      // 3. Unregister tools from the registry
      for (const tool of handle.tools) {
        if (ctx.registry.unregister(tool.name)) {
          unregistered.push(tool.name);
        }
      }

      // 4. Remove handle from tracking array
      ctx.mcpHandles.splice(index, 1);

      // 5. Remove from config
      try {
        const raw = readFileSync(ctx.configPath, "utf-8");
        const config = parseYaml(raw) as Record<string, unknown>;
        const mcp = config.mcp as { servers?: unknown[] } | undefined;

        if (mcp && Array.isArray(mcp.servers)) {
          mcp.servers = mcp.servers.filter(
            (s) => typeof s === "object" && s !== null && (s as Record<string, unknown>).name !== args.name,
          );
          writeFileSync(ctx.configPath, stringifyYaml(config), "utf-8");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Plugin "${args.name}" disconnected and tools unregistered, but failed to update config: ${msg}\nRemoved tools: ${unregistered.join(", ")}`;
      }

      const lines = [`Plugin "${args.name}" removed.`];
      if (unregistered.length > 0) lines.push(`Unregistered tools: ${unregistered.join(", ")}`);
      return lines.join("\n");
    },
  };
}
