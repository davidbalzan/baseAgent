import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRemovePluginTool, type RemovePluginContext } from "../built-in/remove-plugin.tool.js";
import { ToolRegistry } from "../registry.js";
import type { McpServerHandle } from "../mcp-loader.js";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => "mcp:\n  servers: []\n"),
  writeFileSync: vi.fn(),
}));

vi.mock("yaml", () => ({
  parse: vi.fn(() => ({ mcp: { servers: [] } })),
  stringify: vi.fn(() => "mocked-yaml"),
}));

import { readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
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

function makeCtx(handles: McpServerHandle[] = []): RemovePluginContext {
  const registry = new ToolRegistry();
  // Register the tools from the handles
  for (const h of handles) {
    for (const t of h.tools) {
      if (!registry.has(t.name)) {
        registry.register(t);
      }
    }
  }
  return {
    registry,
    mcpHandles: handles,
    configPath: "/tmp/config.yaml",
  };
}

describe("createRemovePluginTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFileSync.mockReturnValue("mcp:\n  servers: []\n");
    mockParseYaml.mockReturnValue({ mcp: { servers: [] } });
  });

  it("has correct name and permission", () => {
    const ctx = makeCtx();
    const tool = createRemovePluginTool(ctx);
    expect(tool.name).toBe("remove_plugin");
    expect(tool.permission).toBe("write");
  });

  it("returns not-installed message if handle not found", async () => {
    const ctx = makeCtx();
    const tool = createRemovePluginTool(ctx);
    const result = await tool.execute({ name: "nonexistent" });

    expect(result).toContain("not installed");
    expect(result).toContain("list_plugins");
  });

  it("closes client, unregisters tools, and removes handle", async () => {
    const handle = makeMockHandle("my-plugin", ["tool_a", "tool_b"]);
    const ctx = makeCtx([handle]);

    expect(ctx.registry.has("tool_a")).toBe(true);
    expect(ctx.registry.has("tool_b")).toBe(true);

    const tool = createRemovePluginTool(ctx);
    const result = await tool.execute({ name: "my-plugin" });

    expect(result).toContain('Plugin "my-plugin" removed');
    expect(result).toContain("tool_a");
    expect(result).toContain("tool_b");
    expect(handle.client.close).toHaveBeenCalled();
    expect(ctx.registry.has("tool_a")).toBe(false);
    expect(ctx.registry.has("tool_b")).toBe(false);
    expect(ctx.mcpHandles).toHaveLength(0);
  });

  it("persists removal to config file", async () => {
    const handle = makeMockHandle("my-plugin", ["tool_a"]);
    const ctx = makeCtx([handle]);
    mockParseYaml.mockReturnValue({
      mcp: { servers: [{ name: "my-plugin", command: "npx", args: ["-y", "my-plugin"] }] },
    });

    const tool = createRemovePluginTool(ctx);
    await tool.execute({ name: "my-plugin" });

    expect(mockWriteFileSync).toHaveBeenCalledWith("/tmp/config.yaml", expect.any(String), "utf-8");
  });

  it("handles client close failure gracefully", async () => {
    const handle = makeMockHandle("my-plugin", ["tool_a"]);
    (handle.client.close as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("already closed"));
    const ctx = makeCtx([handle]);

    const tool = createRemovePluginTool(ctx);
    const result = await tool.execute({ name: "my-plugin" });

    // Should still succeed
    expect(result).toContain('Plugin "my-plugin" removed');
    expect(ctx.mcpHandles).toHaveLength(0);
  });

  it("handles config persist failure gracefully", async () => {
    const handle = makeMockHandle("my-plugin", ["tool_a"]);
    const ctx = makeCtx([handle]);
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });

    const tool = createRemovePluginTool(ctx);
    const result = await tool.execute({ name: "my-plugin" });

    expect(result).toContain("failed to update config");
    expect(result).toContain("ENOENT");
    // Tools should still be unregistered and handle removed
    expect(ctx.registry.has("tool_a")).toBe(false);
    expect(ctx.mcpHandles).toHaveLength(0);
  });

  it("only removes the targeted handle, not others", async () => {
    const handle1 = makeMockHandle("plugin-a", ["tool_a"]);
    const handle2 = makeMockHandle("plugin-b", ["tool_b"]);
    const ctx = makeCtx([handle1, handle2]);

    const tool = createRemovePluginTool(ctx);
    await tool.execute({ name: "plugin-a" });

    expect(ctx.mcpHandles).toHaveLength(1);
    expect(ctx.mcpHandles[0].name).toBe("plugin-b");
    expect(ctx.registry.has("tool_a")).toBe(false);
    expect(ctx.registry.has("tool_b")).toBe(true);
  });
});
