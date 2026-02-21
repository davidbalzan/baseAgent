import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildHeartbeatPrompt,
  buildReviewPrompt,
  isNoActionOutput,
  createHeartbeatScheduler,
} from "@baseagent/plugin-heartbeat/heartbeat";

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

describe("buildReviewPrompt", () => {
  it("includes channel ID in the prompt", () => {
    const prompt = buildReviewPrompt("telegram:123");
    expect(prompt).toContain('channel "telegram:123"');
    expect(prompt).toContain('channelId="telegram:123"');
  });

  it("instructs to call review_sessions and memory_write", () => {
    const prompt = buildReviewPrompt("discord:456");
    expect(prompt).toContain("review_sessions");
    expect(prompt).toContain("memory_write");
    expect(prompt).toContain("USER.md");
  });

  it("instructs to reply 'all clear' when no insights", () => {
    const prompt = buildReviewPrompt("telegram:123");
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
      intervalMs: 60_000,
      workspacePath: tmpDir,
      runSession: mockRunSession,
    });

    await scheduler.tick();
    expect(mockRunSession).not.toHaveBeenCalled();
  });

  it("skips tick when HEARTBEAT.md is empty", async () => {
    writeFileSync(join(tmpDir, "HEARTBEAT.md"), "");
    const mockRunSession = vi.fn();
    const scheduler = createHeartbeatScheduler({
      intervalMs: 60_000,
      workspacePath: tmpDir,
      runSession: mockRunSession,
    });

    await scheduler.tick();
    expect(mockRunSession).not.toHaveBeenCalled();
  });

  it("calls runSession with heartbeat prompt when HEARTBEAT.md has content", async () => {
    writeFileSync(join(tmpDir, "HEARTBEAT.md"), "- [ ] Every morning: Review workspace");
    const mockRunSession = vi.fn().mockResolvedValue({
      sessionId: "test-session",
      output: "All clear — no actions needed.",
    });

    const scheduler = createHeartbeatScheduler({
      intervalMs: 60_000,
      workspacePath: tmpDir,
      runSession: mockRunSession,
    });

    await scheduler.tick();
    expect(mockRunSession).toHaveBeenCalledTimes(1);
    expect(mockRunSession).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("Every morning: Review workspace"),
        channelId: "heartbeat:internal",
      }),
    );
  });

  it("prevents overlapping ticks", async () => {
    writeFileSync(join(tmpDir, "HEARTBEAT.md"), "- [ ] task");

    let resolveSession: ((value: unknown) => void) | null = null;
    const mockRunSession = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveSession = resolve; }),
    );

    const scheduler = createHeartbeatScheduler({
      intervalMs: 60_000,
      workspacePath: tmpDir,
      runSession: mockRunSession,
    });

    // Start first tick (blocks on runSession)
    const tick1 = scheduler.tick();
    // Second tick should be skipped since first is still running
    await scheduler.tick();
    expect(mockRunSession).toHaveBeenCalledTimes(1);

    // Resolve the first tick
    resolveSession!({ sessionId: "t", output: "all clear" });
    await tick1;
  });

  it("sends proactive message when output is actionable and channelId is set", async () => {
    writeFileSync(join(tmpDir, "HEARTBEAT.md"), "- [ ] task");
    const mockRunSession = vi.fn().mockResolvedValue({
      sessionId: "test",
      output: "I found issues and wrote a summary.",
    });
    const mockSendMessage = vi.fn().mockResolvedValue(undefined);

    const scheduler = createHeartbeatScheduler({
      intervalMs: 60_000,
      channelId: "telegram:123",
      workspacePath: tmpDir,
      runSession: mockRunSession,
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
    const mockRunSession = vi.fn().mockResolvedValue({
      sessionId: "test",
      output: "All clear — no actions needed.",
    });
    const mockSendMessage = vi.fn();

    const scheduler = createHeartbeatScheduler({
      intervalMs: 60_000,
      channelId: "telegram:123",
      workspacePath: tmpDir,
      runSession: mockRunSession,
      sendProactiveMessage: mockSendMessage,
    });

    await scheduler.tick();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("stop() clears the interval", () => {
    const scheduler = createHeartbeatScheduler({
      intervalMs: 60_000,
      workspacePath: tmpDir,
      runSession: vi.fn(),
    });

    scheduler.start();
    scheduler.stop();
    // Should not throw
  });
});

describe("memory review phase", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "heartbeat-review-test-"));
    writeFileSync(join(tmpDir, "HEARTBEAT.md"), "- [ ] task");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("skips review when listDistinctChannels is not provided", async () => {
    const mockRunSession = vi.fn().mockResolvedValue({
      sessionId: "test",
      output: "All clear — no actions needed.",
    });

    const scheduler = createHeartbeatScheduler({
      intervalMs: 60_000,
      workspacePath: tmpDir,
      runSession: mockRunSession,
      reviewIntervalMs: 0, // Would trigger immediately if enabled
    });

    await scheduler.tick();
    // Only the heartbeat tick session, no review sessions
    expect(mockRunSession).toHaveBeenCalledTimes(1);
    expect(mockRunSession).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "heartbeat:internal" }),
    );
  });

  it("runs review per channel when interval has elapsed", async () => {
    const mockRunSession = vi.fn().mockResolvedValue({
      sessionId: "test",
      output: "All clear — no actions needed.",
    });
    const mockListChannels = vi.fn().mockReturnValue([
      { channelId: "telegram:123", sessionCount: 5 },
      { channelId: "discord:456", sessionCount: 3 },
    ]);

    const scheduler = createHeartbeatScheduler({
      intervalMs: 60_000,
      workspacePath: tmpDir,
      runSession: mockRunSession,
      reviewIntervalMs: 0, // Triggers immediately
      listDistinctChannels: mockListChannels,
    });

    await scheduler.tick();

    // 1 heartbeat tick + 2 review sessions
    expect(mockRunSession).toHaveBeenCalledTimes(3);
    expect(mockRunSession).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "telegram:123" }),
    );
    expect(mockRunSession).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "discord:456" }),
    );
  });

  it("does not run review before interval has elapsed", async () => {
    const mockRunSession = vi.fn().mockResolvedValue({
      sessionId: "test",
      output: "All clear — no actions needed.",
    });
    const mockListChannels = vi.fn().mockReturnValue([
      { channelId: "telegram:123", sessionCount: 5 },
    ]);

    const scheduler = createHeartbeatScheduler({
      intervalMs: 60_000,
      workspacePath: tmpDir,
      runSession: mockRunSession,
      reviewIntervalMs: 0, // Triggers immediately
      listDistinctChannels: mockListChannels,
    });

    // First tick — triggers review (interval=0 means always due)
    await scheduler.tick();
    expect(mockRunSession).toHaveBeenCalledTimes(2); // heartbeat + 1 review

    mockRunSession.mockClear();
    mockListChannels.mockClear();

    // Now set a very long interval and create a new scheduler
    const scheduler2 = createHeartbeatScheduler({
      intervalMs: 60_000,
      workspacePath: tmpDir,
      runSession: mockRunSession,
      reviewIntervalMs: 999_999_999, // Will never be due
      listDistinctChannels: mockListChannels,
    });

    // First tick on this scheduler — review due (lastReviewAt = 0)
    await scheduler2.tick();
    expect(mockRunSession).toHaveBeenCalledTimes(2); // heartbeat + review

    mockRunSession.mockClear();
    mockListChannels.mockClear();

    // Second tick — review NOT due (just ran)
    await scheduler2.tick();
    expect(mockRunSession).toHaveBeenCalledTimes(1); // Only heartbeat
    expect(mockListChannels).not.toHaveBeenCalled();
  });

  it("passes correct channelId to runSession for each channel", async () => {
    const mockRunSession = vi.fn().mockResolvedValue({
      sessionId: "test",
      output: "Wrote insights to USER.md",
    });
    const mockListChannels = vi.fn().mockReturnValue([
      { channelId: "telegram:111", sessionCount: 2 },
      { channelId: "slack:222", sessionCount: 1 },
    ]);

    const scheduler = createHeartbeatScheduler({
      intervalMs: 60_000,
      workspacePath: tmpDir,
      runSession: mockRunSession,
      reviewIntervalMs: 0,
      listDistinctChannels: mockListChannels,
    });

    await scheduler.tick();

    // Check that review sessions use the correct channelId (not heartbeat:internal)
    const reviewCalls = mockRunSession.mock.calls.filter(
      (call) => (call as [{ input: string; channelId?: string }])[0].channelId !== "heartbeat:internal",
    );
    expect(reviewCalls).toHaveLength(2);
    expect(reviewCalls[0][0].channelId).toBe("telegram:111");
    expect(reviewCalls[1][0].channelId).toBe("slack:222");

    // Review prompts contain the channel ID
    expect(reviewCalls[0][0].input).toContain("telegram:111");
    expect(reviewCalls[1][0].input).toContain("slack:222");
  });

  it("handles empty channel list gracefully", async () => {
    const mockRunSession = vi.fn().mockResolvedValue({
      sessionId: "test",
      output: "All clear — no actions needed.",
    });
    const mockListChannels = vi.fn().mockReturnValue([]);

    const scheduler = createHeartbeatScheduler({
      intervalMs: 60_000,
      workspacePath: tmpDir,
      runSession: mockRunSession,
      reviewIntervalMs: 0,
      listDistinctChannels: mockListChannels,
    });

    await scheduler.tick();

    // Only the heartbeat tick, no review sessions
    expect(mockRunSession).toHaveBeenCalledTimes(1);
    expect(mockRunSession).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "heartbeat:internal" }),
    );
  });

  it("continues reviewing remaining channels if one fails", async () => {
    let callCount = 0;
    const mockRunSession = vi.fn().mockImplementation(({ channelId }: { channelId: string }) => {
      callCount++;
      if (channelId === "telegram:fail") {
        return Promise.reject(new Error("Review session failed"));
      }
      return Promise.resolve({ sessionId: "test", output: "All clear — no actions needed." });
    });
    const mockListChannels = vi.fn().mockReturnValue([
      { channelId: "telegram:fail", sessionCount: 3 },
      { channelId: "discord:ok", sessionCount: 2 },
    ]);

    const scheduler = createHeartbeatScheduler({
      intervalMs: 60_000,
      workspacePath: tmpDir,
      runSession: mockRunSession,
      reviewIntervalMs: 0,
      listDistinctChannels: mockListChannels,
    });

    await scheduler.tick();

    // 1 heartbeat + 2 review attempts (one fails, one succeeds)
    expect(mockRunSession).toHaveBeenCalledTimes(3);
    expect(mockRunSession).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: "discord:ok" }),
    );
  });
});
