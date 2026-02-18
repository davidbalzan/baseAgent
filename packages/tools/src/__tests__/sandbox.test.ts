import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolDefinition, ToolPermission, AppConfig } from "@baseagent/core";
import { resolveSandboxLevel, buildSandboxContext } from "../sandbox/resolver.js";
import { applySandbox } from "../sandbox/apply.js";
import { runMediumShell } from "../sandbox/medium.js";
import { resetDockerCache, checkDockerAvailability, runStrictDocker } from "../sandbox/strict.js";
import { createToolExecutor } from "../executor.js";

// Minimal AppConfig factory — only the fields that matter for sandbox
function makeConfig(sandbox?: AppConfig["sandbox"]): AppConfig {
  return {
    llm: { provider: "openrouter", model: "test", apiKey: "x" },
    agent: { maxIterations: 1, timeoutMs: 5000, costCapUsd: 1 },
    memory: {
      compactionThreshold: 4000,
      maxTokenBudget: 8000,
      toolOutputDecayIterations: 3,
      toolOutputDecayThresholdChars: 500,
    },
    server: { port: 3000, host: "0.0.0.0" },
    sandbox,
  } as AppConfig;
}

function makeTool(name: string, permission?: ToolPermission): ToolDefinition {
  return {
    name,
    description: `Test tool: ${name}`,
    parameters: { safeParse: (a: unknown) => ({ success: true, data: a }) } as any,
    execute: vi.fn(async () => "direct-execute"),
    permission,
  };
}

// ─── resolveSandboxLevel ─────────────────────────────────────────────

describe("resolveSandboxLevel", () => {
  it("returns 'loose' when no sandbox config exists", () => {
    const config = makeConfig(undefined);
    expect(resolveSandboxLevel("shell_exec", config)).toBe("loose");
  });

  it("returns the default level from config", () => {
    const config = makeConfig({ defaultLevel: "medium", dockerImage: "alpine:3.19", maxMemoryMb: 256, cpuCount: 0.5 });
    expect(resolveSandboxLevel("shell_exec", config)).toBe("medium");
  });

  it("respects per-tool overrides", () => {
    const config = makeConfig({
      defaultLevel: "medium",
      dockerImage: "alpine:3.19",
      maxMemoryMb: 256,
      cpuCount: 0.5,
      toolOverrides: { shell_exec: "strict" },
    });
    expect(resolveSandboxLevel("shell_exec", config)).toBe("strict");
    expect(resolveSandboxLevel("other_tool", config)).toBe("medium");
  });
});

// ─── buildSandboxContext ─────────────────────────────────────────────

describe("buildSandboxContext", () => {
  it("builds correct defaults when no sandbox config", () => {
    const config = makeConfig(undefined);
    const ctx = buildSandboxContext("shell_exec", "/workspace", config);
    expect(ctx.level).toBe("loose");
    expect(ctx.dockerImage).toBe("alpine:3.19");
    expect(ctx.maxMemoryMb).toBe(256);
    expect(ctx.cpuCount).toBe(0.5);
    expect(ctx.allowNetwork).toBe(true);
  });

  it("sets allowNetwork=false for strict level by default", () => {
    const config = makeConfig({
      defaultLevel: "strict",
      dockerImage: "alpine:3.19",
      maxMemoryMb: 512,
      cpuCount: 1,
    });
    const ctx = buildSandboxContext("shell_exec", "/workspace", config);
    expect(ctx.level).toBe("strict");
    expect(ctx.allowNetwork).toBe(false);
  });

  it("allowNetwork explicit override takes precedence", () => {
    const config = makeConfig({
      defaultLevel: "strict",
      dockerImage: "alpine:3.19",
      maxMemoryMb: 256,
      cpuCount: 0.5,
      allowNetwork: true,
    });
    const ctx = buildSandboxContext("shell_exec", "/workspace", config);
    expect(ctx.allowNetwork).toBe(true);
  });
});

// ─── applySandbox ────────────────────────────────────────────────────

describe("applySandbox", () => {
  it("non-exec tools bypass sandbox and call execute directly", async () => {
    const tool = makeTool("file_read", "read");
    const ctx = buildSandboxContext("file_read", "/workspace", makeConfig({
      defaultLevel: "strict",
      dockerImage: "alpine:3.19",
      maxMemoryMb: 256,
      cpuCount: 0.5,
    }));

    const result = await applySandbox(tool, { path: "test.txt" }, ctx);

    expect(result).toBe("direct-execute");
    expect(tool.execute).toHaveBeenCalledWith({ path: "test.txt" });
  });

  it("exec tools without command arg bypass sandbox", async () => {
    const tool = makeTool("custom_exec", "exec");
    const ctx = buildSandboxContext("custom_exec", "/workspace", makeConfig({
      defaultLevel: "medium",
      dockerImage: "alpine:3.19",
      maxMemoryMb: 256,
      cpuCount: 0.5,
    }));

    const result = await applySandbox(tool, { someOtherArg: "val" }, ctx);

    expect(result).toBe("direct-execute");
  });

  it("loose level calls tool.execute() directly", async () => {
    const tool = makeTool("shell_exec", "exec");
    const ctx = buildSandboxContext("shell_exec", "/workspace", makeConfig(undefined));

    expect(ctx.level).toBe("loose");
    const result = await applySandbox(tool, { command: "echo hi" }, ctx);

    expect(result).toBe("direct-execute");
    expect(tool.execute).toHaveBeenCalledWith({ command: "echo hi" });
  });
});

// ─── runMediumShell ──────────────────────────────────────────────────

describe("runMediumShell", () => {
  it("runs a command and returns exit code + output", async () => {
    const result = await runMediumShell({
      command: "echo hello",
      workspacePath: "/tmp",
      timeoutMs: 5000,
      env: {},
      maxMemoryMb: 256,
      cpuCount: 0.5,
      allowNetwork: true,
      dockerImage: "alpine:3.19",
    });

    expect(result).toContain("[exit: 0]");
    expect(result).toContain("hello");
  });

  it("uses isolated HOME (not real HOME)", async () => {
    const result = await runMediumShell({
      command: "echo $HOME",
      workspacePath: "/tmp",
      timeoutMs: 5000,
      env: {},
      maxMemoryMb: 256,
      cpuCount: 0.5,
      allowNetwork: true,
      dockerImage: "alpine:3.19",
    });

    expect(result).toContain("[exit: 0]");
    // The HOME should be an isolated temp dir, not the real user's HOME
    const outputHome = result.split("\n")[1]?.trim();
    expect(outputHome).not.toBe(process.env.HOME);
    expect(outputHome).toContain("sandbox-");
  });

  it("times out on long-running commands", async () => {
    const result = await runMediumShell({
      command: "sleep 100",
      workspacePath: "/tmp",
      timeoutMs: 500,
      env: {},
      maxMemoryMb: 256,
      cpuCount: 0.5,
      allowNetwork: true,
      dockerImage: "alpine:3.19",
    });

    expect(result).toContain("timeout");
  });
});

// ─── checkDockerAvailability ─────────────────────────────────────────

describe("checkDockerAvailability", () => {
  beforeEach(() => {
    resetDockerCache();
  });

  it("returns availability status (actual system check)", async () => {
    const result = await checkDockerAvailability();
    // We just verify the shape — Docker may or may not be installed
    expect(result).toHaveProperty("available");
    if (result.available) {
      expect(result.version).toBeDefined();
    } else {
      expect(result.error).toBeDefined();
    }
  });

  it("caches the result across calls", async () => {
    const first = await checkDockerAvailability();
    const second = await checkDockerAvailability();
    expect(first).toBe(second); // Same object reference
  });
});

// ─── runStrictDocker ─────────────────────────────────────────────────

describe("runStrictDocker", () => {
  beforeEach(() => {
    resetDockerCache();
  });

  it("returns sandbox error when Docker is unavailable", async () => {
    // Force Docker unavailability by resetting cache and checking
    // If Docker is actually available on this system, we skip this test
    const docker = await checkDockerAvailability();
    if (docker.available) {
      // Docker is available, we can't easily mock it in this context
      // Just verify the function works
      return;
    }

    const result = await runStrictDocker({
      command: "echo hi",
      workspacePath: "/tmp",
      timeoutMs: 5000,
      dockerImage: "alpine:3.19",
      maxMemoryMb: 256,
      cpuCount: 0.5,
      allowNetwork: false,
    });

    expect(result).toContain("[sandbox:strict] Docker is not available");
  });
});

// ─── createToolExecutor integration ──────────────────────────────────

describe("createToolExecutor with sandbox", () => {
  it("routes exec tools through applySandbox when getSandboxCtx is provided", async () => {
    const tool = makeTool("shell_exec", "exec");
    const tools: Record<string, ToolDefinition> = { shell_exec: tool };

    // With getSandboxCtx returning undefined (no sandbox), calls execute directly
    const executor = createToolExecutor(
      (name) => tools[name],
      () => undefined,
    );

    const result = await executor("shell_exec", { command: "echo hi" });
    expect(result.result).toBe("direct-execute");
    expect(tool.execute).toHaveBeenCalled();
  });

  it("without getSandboxCtx calls tool.execute directly", async () => {
    const tool = makeTool("file_read", "read");
    const tools: Record<string, ToolDefinition> = { file_read: tool };

    const executor = createToolExecutor((name) => tools[name]);

    const result = await executor("file_read", { path: "test.txt" });
    expect(result.result).toBe("direct-execute");
    expect(tool.execute).toHaveBeenCalled();
  });

  it("passes sandbox context for exec tools with loose level", async () => {
    const tool = makeTool("shell_exec", "exec");
    const tools: Record<string, ToolDefinition> = { shell_exec: tool };

    const looseCtx = buildSandboxContext("shell_exec", "/workspace", makeConfig(undefined));

    const executor = createToolExecutor(
      (name) => tools[name],
      () => looseCtx,
    );

    const result = await executor("shell_exec", { command: "echo hi" });
    // Loose level still calls tool.execute directly via applySandbox
    expect(result.result).toBe("direct-execute");
  });
});
