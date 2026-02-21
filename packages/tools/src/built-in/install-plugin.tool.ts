import { readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import { ToolPermissionSchema, type ToolDefinition, type McpServerConfig } from "@baseagent/core";
import type { ToolRegistry } from "../registry.js";
import { loadMcpServers, type McpServerHandle } from "../mcp-loader.js";

export interface InstallPluginContext {
  registry: ToolRegistry;
  mcpHandles: McpServerHandle[];
  configPath: string;
}

const parameters = z.object({
  package: z.string().describe("npm package name to install (e.g. '@anthropic/mcp-browser', 'mcp-server-filesystem')."),
  permission: ToolPermissionSchema.default("read").describe("Default permission level for all tools from this plugin."),
  env: z.record(z.string(), z.string()).optional().describe("Environment variables passed to the plugin process."),
});

/** Derive a clean server name from an npm package name. */
function deriveServerName(pkg: string): string {
  // "@scope/pkg-name" -> "scope-pkg-name", "pkg-name" -> "pkg-name"
  return pkg.replace(/^@/, "").replace(/\//g, "-");
}

export function createInstallPluginTool(ctx: InstallPluginContext): ToolDefinition<typeof parameters> {
  return {
    name: "install_plugin",
    description:
      "Install a plugin from npm. Spawns an MCP server via npx, registers its tools, and persists to config. " +
      "Use list_plugins to see installed plugins, remove_plugin to uninstall.",
    parameters,
    permission: "write",
    execute: async (args) => {
      const name = deriveServerName(args.package);

      // Guard: already installed
      const existing = ctx.mcpHandles.find((h) => h.name === name);
      if (existing) {
        const toolNames = existing.tools.map((t) => t.name).join(", ");
        return `Plugin "${name}" is already installed. Tools: ${toolNames}`;
      }

      const serverConfig: McpServerConfig = {
        name,
        command: "npx",
        args: ["-y", args.package],
        env: args.env,
        permission: args.permission,
      };

      // 1. Connect and discover tools
      const result = await loadMcpServers([serverConfig]);
      if (result.failed.length > 0) {
        return `Failed to install "${args.package}": ${result.failed[0].error}`;
      }

      const handle = result.handles[0];
      const registered: string[] = [];
      const skipped: string[] = [];

      // 2. Register tools — skip duplicates
      for (const tool of handle.tools) {
        if (ctx.registry.has(tool.name)) {
          skipped.push(tool.name);
        } else {
          ctx.registry.register(tool);
          registered.push(tool.name);
        }
      }

      // 3. Track handle for lifecycle management
      ctx.mcpHandles.push(handle);

      // 4. Persist to config
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
          (s) => typeof s === "object" && s !== null && (s as Record<string, unknown>).name !== name,
        );
        mcp.servers.push(serverConfig);

        writeFileSync(ctx.configPath, stringifyYaml(config), "utf-8");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const summary = registered.length > 0 ? `Registered: ${registered.join(", ")}` : "No new tools registered.";
        return `Plugin installed but failed to persist config: ${msg}\n${summary}`;
      }

      const lines = [`Plugin "${name}" installed from ${args.package}.`];
      if (registered.length > 0) lines.push(`Tools (${registered.length}): ${registered.join(", ")}`);
      if (skipped.length > 0) lines.push(`Skipped (already registered): ${skipped.join(", ")}`);
      return lines.join("\n");
    },
  };
}
