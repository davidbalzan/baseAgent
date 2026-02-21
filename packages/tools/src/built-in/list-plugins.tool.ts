import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { ToolDefinition } from "@baseagent/core";
import type { McpServerHandle } from "../mcp-loader.js";

export interface ListPluginsContext {
  mcpHandles: McpServerHandle[];
  configPath: string;
}

const parameters = z.object({});

export function createListPluginsTool(ctx: ListPluginsContext): ToolDefinition<typeof parameters> {
  return {
    name: "list_plugins",
    description:
      "List all installed plugins (MCP servers). Shows connected servers with their tools, " +
      "and any configured-but-not-connected servers.",
    parameters,
    permission: "read",
    execute: async () => {
      const lines: string[] = [];

      // 1. Connected plugins
      if (ctx.mcpHandles.length === 0) {
        lines.push("No plugins currently connected.");
      } else {
        lines.push(`Connected plugins (${ctx.mcpHandles.length}):`);
        for (const handle of ctx.mcpHandles) {
          const toolNames = handle.tools.map((t) => t.name).join(", ");
          lines.push(`  - ${handle.name} (${handle.tools.length} tools): ${toolNames}`);
        }
      }

      // 2. Check config for servers that aren't connected
      try {
        const raw = readFileSync(ctx.configPath, "utf-8");
        const config = parseYaml(raw) as Record<string, unknown>;
        const mcp = config.mcp as { servers?: unknown[] } | undefined;
        const configuredServers = Array.isArray(mcp?.servers) ? mcp.servers : [];

        const connectedNames = new Set(ctx.mcpHandles.map((h) => h.name));
        const notConnected = configuredServers.filter(
          (s) => typeof s === "object" && s !== null && !connectedNames.has((s as Record<string, unknown>).name as string),
        );

        if (notConnected.length > 0) {
          lines.push("");
          lines.push(`Configured but not connected (${notConnected.length}):`);
          for (const s of notConnected) {
            const entry = s as Record<string, unknown>;
            lines.push(`  - ${entry.name} (${entry.command} ${Array.isArray(entry.args) ? (entry.args as string[]).join(" ") : ""})`);
          }
        }
      } catch {
        // Config read failure is non-fatal — just show connected plugins
      }

      return lines.join("\n");
    },
  };
}
