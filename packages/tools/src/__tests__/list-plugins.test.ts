import { describe, it, expect, vi, beforeEach } from "vitest";
import { createListPluginsTool, type ListPluginsContext } from "../built-in/list-plugins.tool.js";
import type { McpServerHandle } from "../mcp-loader.js";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => "mcp:\n  servers: []\n"),
}));

vi.mock("yaml", () => ({
  parse: vi.fn(() => ({ mcp: { servers: [] } })),
}));

import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

const mockReadFileSync = vi.mocked(readFileSync);
const mockParseYaml = vi.mocked(parseYaml);

function makeMockHandle(name: string, toolNames: string[]): McpServerHandle {
  return {
    name,
    client: { close: vi.fn() } as unknown as McpServerHandle["client"],
    tools: toolNames.map((n) => ({
      name: n,
      description: `Tool ${n}`,
      parameters: {} as never,
      permission: "read" as const,
      execute: vi.fn(async () => "ok"),
    })),
  };
}

function makeCtx(handles: McpServerHandle[] = []): ListPluginsContext {
  return {
    mcpHandles: handles,
    configPath: "/tmp/config.yaml",
  };
}

describe("createListPluginsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFileSync.mockReturnValue("mcp:\n  servers: []\n");
    mockParseYaml.mockReturnValue({ mcp: { servers: [] } });
  });

  it("has correct name and permission", () => {
    const tool = createListPluginsTool(makeCtx());
    expect(tool.name).toBe("list_plugins");
    expect(tool.permission).toBe("read");
  });

  it("shows no-plugins message when empty", async () => {
    const tool = createListPluginsTool(makeCtx());
    const result = await tool.execute({});
    expect(result).toContain("No plugins currently connected");
  });

  it("lists connected plugins with tool names", async () => {
    const handles = [
      makeMockHandle("my-plugin", ["tool_a", "tool_b"]),
      makeMockHandle("other-plugin", ["tool_c"]),
    ];
    const tool = createListPluginsTool(makeCtx(handles));
    const result = await tool.execute({});

    expect(result).toContain("Connected plugins (2)");
    expect(result).toContain("my-plugin (2 tools): tool_a, tool_b");
    expect(result).toContain("other-plugin (1 tools): tool_c");
  });

  it("shows configured-but-not-connected servers", async () => {
    const handles = [makeMockHandle("connected-plugin", ["tool_a"])];
    mockParseYaml.mockReturnValue({
      mcp: {
        servers: [
          { name: "connected-plugin", command: "npx", args: ["-y", "connected-plugin"] },
          { name: "offline-plugin", command: "npx", args: ["-y", "offline-plugin"] },
        ],
      },
    });

    const tool = createListPluginsTool(makeCtx(handles));
    const result = await tool.execute({});

    expect(result).toContain("Connected plugins (1)");
    expect(result).toContain("Configured but not connected (1)");
    expect(result).toContain("offline-plugin");
    expect(result).not.toMatch(/Configured.*connected-plugin/);
  });

  it("handles config read failure gracefully", async () => {
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });
    const handles = [makeMockHandle("my-plugin", ["tool_a"])];

    const tool = createListPluginsTool(makeCtx(handles));
    const result = await tool.execute({});

    // Should still show connected plugins without crashing
    expect(result).toContain("my-plugin");
    expect(result).not.toContain("Configured but not connected");
  });
});
