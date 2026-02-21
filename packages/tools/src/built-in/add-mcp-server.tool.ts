import { readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import { ToolPermissionSchema, type ToolDefinition, type McpServerConfig } from "@baseagent/core";
import type { ToolRegistry } from "../registry.js";
import { loadMcpServers, type McpServerHandle } from "../mcp-loader.js";

export interface AddMcpServerContext {
  registry: ToolRegistry;
  mcpHandles: McpServerHandle[];
  configPath: string;
}

const parameters = z.object({
  name: z.string().describe("Unique name for this MCP server."),
  command: z.string().describe("Command to spawn the MCP server process (e.g. 'npx')."),
  args: z.array(z.string()).default([]).describe("Arguments to pass to the command."),
  env: z.record(z.string(), z.string()).optional().describe("Environment variables for the server process."),
  permission: ToolPermissionSchema.default("read").describe("Default permission level for all tools from this server."),
  toolPermissions: z.record(z.string(), ToolPermissionSchema).optional().describe("Per-tool permission overrides."),
});

export function createAddMcpServerTool(ctx: AddMcpServerContext): ToolDefinition<typeof parameters> {
  return {
    name: "add_mcp_server",
    description:
      "Connect a new MCP server at runtime. Tools are available immediately and config persists across restarts.",
    parameters,
    permission: "write",
    execute: async (args) => {
      // Guard: if this server name is already connected, return immediately
      // without spawning a second process (prevents double-calls within a session).
      const alreadyConnected = ctx.mcpHandles.find((h) => h.name === args.name);
      if (alreadyConnected) {
        const toolNames = alreadyConnected.tools.map((t) => t.name).join(", ");
        return `MCP server "${args.name}" is already connected. Tools available: ${toolNames}`;
      }

      const serverConfig: McpServerConfig = {
        name: args.name,
        command: args.command,
        args: args.args,
        env: args.env,
        permission: args.permission,
        toolPermissions: args.toolPermissions,
      };

      // 1. Connect and discover tools
      const result = await loadMcpServers([serverConfig]);
      if (result.failed.length > 0) {
        return `Error connecting to "${args.name}": ${result.failed[0].error}`;
      }

      const handle = result.handles[0];
      const registered: string[] = [];
      const skipped: string[] = [];

      // 2. Register tools — skip any already registered (e.g. re-added server)
      for (const tool of handle.tools) {
        if (ctx.registry.has(tool.name)) {
          skipped.push(tool.name);
        } else {
          ctx.registry.register(tool);
          registered.push(tool.name);
        }
      }

      // 3. Track handle for graceful shutdown cleanup
      ctx.mcpHandles.push(handle);

      // 4. Persist to config — non-fatal if it fails, tools are already live
      try {
        const raw = readFileSync(ctx.configPath, "utf-8");
        const config = parseYaml(raw) as Record<string, unknown>;

        if (!config.mcp || typeof config.mcp !== "object") {
          config.mcp = { servers: [] };
        }
        const mcp = config.mcp as { servers: unknown[] };
        if (!Array.isArray(mcp.servers)) {
          mcp.servers = [];
        }

        // Replace existing entry with same name if present
        mcp.servers = mcp.servers.filter(
          (s) => typeof s === "object" && s !== null && (s as Record<string, unknown>).name !== args.name,
        );
        mcp.servers.push(serverConfig);

        writeFileSync(ctx.configPath, stringifyYaml(config), "utf-8");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const summary = registered.length > 0 ? `Registered: ${registered.join(", ")}` : "No new tools registered.";
        return `Connected successfully but failed to persist config: ${msg}\n${summary}`;
      }

      const lines = [`MCP server "${args.name}" connected and persisted to config.`];
      if (registered.length > 0) lines.push(`Registered tools (${registered.length}): ${registered.join(", ")}`);
      if (skipped.length > 0) lines.push(`Skipped (already registered): ${skipped.join(", ")}`);
      return lines.join("\n");
    },
  };
}
