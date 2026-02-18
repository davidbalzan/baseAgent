import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildHeartbeatPrompt,
  isNoActionOutput,
  createHeartbeatScheduler,
  type RunSessionFn,
} from "../heartbeat.js";

describe("buildHeartbeatPrompt", () => {
  it("includes current time, day, and heartbeat content", () => {
    const now = new Date("2026-02-18T14:30:00.000Z");
    const content = "- [ ] Every morning: Do something";

    const prompt = buildHeartbeatPrompt(content, now);

    expect(prompt).toContain("2026-02-18T14:30:00.000Z");
    expect(prompt).toContain("Wednesday");
    expect(prompt).toContain("Every morning: Do something");
    expect(prompt).toContain("scheduled heartbeat check");
  });

  it("includes instruction to reply 'all clear' when nothing is due", () => {
    const prompt = buildHeartbeatPrompt("- [ ] task", new Date());
    expect(prompt).toContain("All clear");
  });
});

describe("isNoActionOutput", () => {
  it("returns true for 'all clear' variants", () => {
    expect(isNoActionOutput("All clear — no actions needed.")).toBe(true);
    expect(isNoActionOutput("all clear")).toBe(true);
    expect(isNoActionOutput("ALL CLEAR")).toBe(true);
    expect(isNoActionOutput("No actions needed at this time.")).toBe(true);
    expect(isNoActionOutput("  No tasks due  ")).toBe(true);
    expect(isNoActionOutput("Nothing to do right now.")).toBe(true);
    expect(isNoActionOutput("No items due at this time.")).toBe(true);
  });

  it("returns false for actionable output", () => {
    expect(isNoActionOutput("I reviewed the workspace and found 3 issues.")).toBe(false);
    expect(isNoActionOutput("Summary written to MEMORY.md")).toBe(false);
    expect(isNoActionOutput("")).toBe(false);
  });
});

describe("createHeartbeatScheduler", () => {
  const mockConfig = {
    heartbeat: { enabled: true, intervalMs: 60_000 },
    llm: { provider: "openrouter" as const, model: "test" },
    agent: { maxIterations: 10, timeoutMs: 120_000, costCapUsd: 1 },
    memory: {
      compactionThreshold: 4000,
      maxTokenBudget: 8000,
      toolOutputDecayIterations: 3,
      toolOutputDecayThresholdChars: 500,
    },
    server: { port: 3000, host: "0.0.0.0" },
  };

  const mockSessionDeps = {} as any;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "heartbeat-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("skips tick when HEARTBEAT.md is missing", async () => {
    const mockRunSession = vi.fn();
    const scheduler = createHeartbeatScheduler({
      config: mockConfig,
      sessionDeps: mockSessionDeps,
      workspacePath: tmpDir,
      runSessionFn: mockRunSession,
    });

    await scheduler.tick();
    expect(mockRunSession).not.toHaveBeenCalled();
  });

  it("skips tick when HEARTBEAT.md is empty", async () => {
    writeFileSync(join(tmpDir, "HEARTBEAT.md"), "");
    const mockRunSession = vi.fn();
    const scheduler = createHeartbeatScheduler({
      config: mockConfig,
      sessionDeps: mockSessionDeps,
      workspacePath: tmpDir,
      runSessionFn: mockRunSession,
    });

    await scheduler.tick();
    expect(mockRunSession).not.toHaveBeenCalled();
  });

  it("calls runSession with heartbeat prompt when HEARTBEAT.md has content", async () => {
    writeFileSync(join(tmpDir, "HEARTBEAT.md"), "- [ ] Every morning: Review workspace");
    const mockRunSession: RunSessionFn = vi.fn().mockResolvedValue({
      sessionId: "test-session",
      output: "All clear — no actions needed.",
      state: {},
    });

    const scheduler = createHeartbeatScheduler({
      config: mockConfig,
      sessionDeps: mockSessionDeps,
      workspacePath: tmpDir,
      runSessionFn: mockRunSession,
    });

    await scheduler.tick();
    expect(mockRunSession).toHaveBeenCalledTimes(1);
    expect(mockRunSession).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("Every morning: Review workspace"),
        channelId: "heartbeat:internal",
      }),
      mockSessionDeps,
    );
  });

  it("prevents overlapping ticks", async () => {
    writeFileSync(join(tmpDir, "HEARTBEAT.md"), "- [ ] task");

    let resolveSession: ((value: any) => void) | null = null;
    const mockRunSession: RunSessionFn = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveSession = resolve; }),
    );

    const scheduler = createHeartbeatScheduler({
      config: mockConfig,
      sessionDeps: mockSessionDeps,
      workspacePath: tmpDir,
      runSessionFn: mockRunSession,
    });

    // Start first tick (blocks on runSession)
    const tick1 = scheduler.tick();
    // Second tick should be skipped since first is still running
    await scheduler.tick();
    expect(mockRunSession).toHaveBeenCalledTimes(1);

    // Resolve the first tick
    resolveSession!({ sessionId: "t", output: "all clear", state: {} });
    await tick1;
  });

  it("sends proactive message when output is actionable and channelId is set", async () => {
    writeFileSync(join(tmpDir, "HEARTBEAT.md"), "- [ ] task");
    const configWithChannel = {
      ...mockConfig,
      heartbeat: { ...mockConfig.heartbeat, channelId: "telegram:123" },
    };
    const mockRunSession: RunSessionFn = vi.fn().mockResolvedValue({
      sessionId: "test",
      output: "I found issues and wrote a summary.",
      state: {},
    });
    const mockSendMessage = vi.fn().mockResolvedValue(undefined);

    const scheduler = createHeartbeatScheduler({
      config: configWithChannel,
      sessionDeps: mockSessionDeps,
      workspacePath: tmpDir,
      runSessionFn: mockRunSession,
      sendProactiveMessage: mockSendMessage,
    });

    await scheduler.tick();
    expect(mockSendMessage).toHaveBeenCalledWith(
      "telegram:123",
      "I found issues and wrote a summary.",
    );
  });

  it("suppresses proactive message when output is 'all clear'", async () => {
    writeFileSync(join(tmpDir, "HEARTBEAT.md"), "- [ ] task");
    const configWithChannel = {
      ...mockConfig,
      heartbeat: { ...mockConfig.heartbeat, channelId: "telegram:123" },
    };
    const mockRunSession: RunSessionFn = vi.fn().mockResolvedValue({
      sessionId: "test",
      output: "All clear — no actions needed.",
      state: {},
    });
    const mockSendMessage = vi.fn();

    const scheduler = createHeartbeatScheduler({
      config: configWithChannel,
      sessionDeps: mockSessionDeps,
      workspacePath: tmpDir,
      runSessionFn: mockRunSession,
      sendProactiveMessage: mockSendMessage,
    });

    await scheduler.tick();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("stop() clears the interval", () => {
    const scheduler = createHeartbeatScheduler({
      config: mockConfig,
      sessionDeps: mockSessionDeps,
      workspacePath: tmpDir,
      runSessionFn: vi.fn(),
    });

    scheduler.start();
    scheduler.stop();
    // Should not throw
  });
});
