import { describe, it, expect, vi, beforeEach } from "vitest";
import { createInstallPluginTool, type InstallPluginContext } from "../built-in/install-plugin.tool.js";
import { ToolRegistry } from "../registry.js";
import type { McpServerHandle } from "../mcp-loader.js";

// Mock mcp-loader
vi.mock("../mcp-loader.js", () => ({
  loadMcpServers: vi.fn(),
}));

// Mock fs and yaml
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => "mcp:\n  servers: []\n"),
  writeFileSync: vi.fn(),
}));

vi.mock("yaml", () => ({
  parse: vi.fn(() => ({ mcp: { servers: [] } })),
  stringify: vi.fn(() => "mocked-yaml"),
}));

import { loadMcpServers } from "../mcp-loader.js";
import { readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

const mockLoadMcpServers = vi.mocked(loadMcpServers);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockParseYaml = vi.mocked(parseYaml);

function makeCtx(): InstallPluginContext {
  return {
    registry: new ToolRegistry(),
    mcpHandles: [],
    configPath: "/tmp/config.yaml",
  };
}

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

describe("createInstallPluginTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFileSync.mockReturnValue("mcp:\n  servers: []\n");
    mockParseYaml.mockReturnValue({ mcp: { servers: [] } });
  });

  it("has correct name and permission", () => {
    const tool = createInstallPluginTool(makeCtx());
    expect(tool.name).toBe("install_plugin");
    expect(tool.permission).toBe("write");
  });

  it("returns already-installed message if handle exists", async () => {
    const ctx = makeCtx();
    ctx.mcpHandles.push(makeMockHandle("some-mcp-plugin", ["tool_a"]));
    const tool = createInstallPluginTool(ctx);

    const result = await tool.execute({ package: "some-mcp-plugin", permission: "read" });
    expect(result).toContain("already installed");
    expect(mockLoadMcpServers).not.toHaveBeenCalled();
  });

  it("derives server name from scoped package", async () => {
    const ctx = makeCtx();
    const handle = makeMockHandle("anthropic-mcp-browser", ["browse"]);
    mockLoadMcpServers.mockResolvedValue({ handles: [handle], loaded: ["anthropic-mcp-browser"], failed: [] });

    const tool = createInstallPluginTool(ctx);
    await tool.execute({ package: "@anthropic/mcp-browser", permission: "read" });

    expect(mockLoadMcpServers).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "anthropic-mcp-browser",
        command: "npx",
        args: ["-y", "@anthropic/mcp-browser"],
      }),
    ]);
  });

  it("registers tools and tracks handle on success", async () => {
    const ctx = makeCtx();
    const handle = makeMockHandle("my-plugin", ["tool_x", "tool_y"]);
    mockLoadMcpServers.mockResolvedValue({ handles: [handle], loaded: ["my-plugin"], failed: [] });

    const tool = createInstallPluginTool(ctx);
    const result = await tool.execute({ package: "my-plugin", permission: "read" });

    expect(result).toContain('Plugin "my-plugin" installed');
    expect(result).toContain("tool_x");
    expect(result).toContain("tool_y");
    expect(ctx.registry.has("tool_x")).toBe(true);
    expect(ctx.registry.has("tool_y")).toBe(true);
    expect(ctx.mcpHandles).toHaveLength(1);
  });

  it("skips tools already registered", async () => {
    const ctx = makeCtx();
    // Pre-register a tool
    ctx.registry.register({
      name: "tool_x",
      description: "existing",
      parameters: {} as never,
      permission: "read",
      execute: async () => "ok",
    });

    const handle = makeMockHandle("my-plugin", ["tool_x", "tool_y"]);
    mockLoadMcpServers.mockResolvedValue({ handles: [handle], loaded: ["my-plugin"], failed: [] });

    const tool = createInstallPluginTool(ctx);
    const result = await tool.execute({ package: "my-plugin", permission: "read" });

    expect(result).toContain("Skipped");
    expect(result).toContain("tool_x");
  });

  it("returns error message on connection failure", async () => {
    const ctx = makeCtx();
    mockLoadMcpServers.mockResolvedValue({ handles: [], loaded: [], failed: [{ name: "bad-plugin", error: "connection refused" }] });

    const tool = createInstallPluginTool(ctx);
    const result = await tool.execute({ package: "bad-plugin", permission: "read" });

    expect(result).toContain("Failed to install");
    expect(result).toContain("connection refused");
    expect(ctx.mcpHandles).toHaveLength(0);
  });

  it("persists config to YAML file", async () => {
    const ctx = makeCtx();
    const handle = makeMockHandle("my-plugin", ["tool_a"]);
    mockLoadMcpServers.mockResolvedValue({ handles: [handle], loaded: ["my-plugin"], failed: [] });

    const tool = createInstallPluginTool(ctx);
    await tool.execute({ package: "my-plugin", permission: "read" });

    expect(mockWriteFileSync).toHaveBeenCalledWith("/tmp/config.yaml", expect.any(String), "utf-8");
  });

  it("handles config persist failure gracefully", async () => {
    const ctx = makeCtx();
    const handle = makeMockHandle("my-plugin", ["tool_a"]);
    mockLoadMcpServers.mockResolvedValue({ handles: [handle], loaded: ["my-plugin"], failed: [] });
    mockReadFileSync.mockImplementation(() => { throw new Error("ENOENT"); });

    const tool = createInstallPluginTool(ctx);
    const result = await tool.execute({ package: "my-plugin", permission: "read" });

    expect(result).toContain("failed to persist config");
    expect(result).toContain("ENOENT");
    // Tools should still be registered
    expect(ctx.registry.has("tool_a")).toBe(true);
  });

  it("passes env vars through to server config", async () => {
    const ctx = makeCtx();
    const handle = makeMockHandle("my-plugin", ["tool_a"]);
    mockLoadMcpServers.mockResolvedValue({ handles: [handle], loaded: ["my-plugin"], failed: [] });

    const tool = createInstallPluginTool(ctx);
    await tool.execute({ package: "my-plugin", permission: "read", env: { API_KEY: "secret" } });

    expect(mockLoadMcpServers).toHaveBeenCalledWith([
      expect.objectContaining({ env: { API_KEY: "secret" } }),
    ]);
  });
});
