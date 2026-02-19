import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import type { ToolDefinition, McpServerConfig } from "@baseagent/core";

export interface McpServerHandle {
  name: string;
  client: Client;
  tools: ToolDefinition[];
}

export interface LoadMcpServersResult {
  handles: McpServerHandle[];
  loaded: string[];
  failed: { name: string; error: string }[];
}

export async function loadMcpServers(servers: McpServerConfig[]): Promise<LoadMcpServersResult> {
  const handles: McpServerHandle[] = [];
  const loaded: string[] = [];
  const failed: { name: string; error: string }[] = [];

  for (const serverConfig of servers) {
    try {
      const client = new Client({ name: "baseagent", version: "0.1.0" }, { capabilities: {} });
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args,
        env: serverConfig.env,
      });
      await client.connect(transport);
      const { tools: mcpTools } = await client.listTools();

      const toolDefs: ToolDefinition[] = mcpTools.map((mcpTool) => {
        const permission = serverConfig.toolPermissions?.[mcpTool.name] ?? serverConfig.permission;
        return {
          name: mcpTool.name,
          description: mcpTool.description ?? mcpTool.name,
          parameters: z.unknown() as unknown as z.ZodTypeAny, // stub — bypassed by executor guard
          jsonSchema: mcpTool.inputSchema as Record<string, unknown>,
          permission,
          execute: async (args: unknown) => {
            const result = await client.callTool({
              name: mcpTool.name,
              arguments: args as Record<string, unknown>,
            });
            const content = result.content as Array<{ type: string; text?: string }>;
            return (
              content
                .filter((c) => c.type === "text" && typeof c.text === "string")
                .map((c) => c.text as string)
                .join("\n") || "[empty response]"
            );
          },
        };
      });

      handles.push({ name: serverConfig.name, client, tools: toolDefs });
      loaded.push(serverConfig.name);
    } catch (err) {
      failed.push({ name: serverConfig.name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { handles, loaded, failed };
}

export async function closeMcpServers(handles: McpServerHandle[]): Promise<void> {
  await Promise.allSettled(handles.map((h) => h.client.close()));
}
