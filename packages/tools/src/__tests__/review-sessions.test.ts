import { describe, it, expect, vi } from "vitest";
import { createReviewSessionsTool, type ListRecentSessionsFn } from "../built-in/review-sessions.tool.js";

function makeListFn(results: ReturnType<ListRecentSessionsFn> = []): ListRecentSessionsFn {
  return vi.fn(() => results);
}

describe("createReviewSessionsTool", () => {
  it("has correct name and permission", () => {
    const tool = createReviewSessionsTool(makeListFn());
    expect(tool.name).toBe("review_sessions");
    expect(tool.permission).toBe("read");
  });

  it("returns empty message when no sessions found", async () => {
    const tool = createReviewSessionsTool(makeListFn([]));
    const result = await tool.execute({});
    expect(result).toContain("No completed sessions found in the last 7 day(s)");
  });

  it("includes channel in empty message when filtered", async () => {
    const tool = createReviewSessionsTool(makeListFn([]));
    const result = await tool.execute({ channelId: "telegram:42" });
    expect(result).toContain("in channel telegram:42");
  });

  it("includes custom daysBack in empty message", async () => {
    const tool = createReviewSessionsTool(makeListFn([]));
    const result = await tool.execute({ daysBack: 14 });
    expect(result).toContain("in the last 14 day(s)");
  });

  it("formats sessions in chronological order (oldest first)", async () => {
    const tool = createReviewSessionsTool(makeListFn([
      {
        id: "newer",
        input: "second message",
        output: "second reply",
        channelId: "telegram:42",
        createdAt: "2025-02-20T17:04:00.000Z",
      },
      {
        id: "older",
        input: "first message",
        output: "first reply",
        channelId: "telegram:42",
        createdAt: "2025-02-19T08:00:00.000Z",
      },
    ]));

    const result = await tool.execute({});
    // Oldest should appear before newest
    const olderIdx = result.indexOf("first message");
    const newerIdx = result.indexOf("second message");
    expect(olderIdx).toBeLessThan(newerIdx);
  });

  it("includes header with day count and session count", async () => {
    const tool = createReviewSessionsTool(makeListFn([
      { id: "a", input: "hi", output: "hello", channelId: null, createdAt: "2025-02-20T10:00:00Z" },
    ]));

    const result = await tool.execute({ daysBack: 3 });
    expect(result).toContain("# Recent Conversations (3 days, 1 sessions)");
  });

  it("formats date and channel correctly", async () => {
    const tool = createReviewSessionsTool(makeListFn([
      {
        id: "abc",
        input: "test input",
        output: "test output",
        channelId: "discord:99",
        createdAt: "2025-02-20T17:04:00.000Z",
      },
    ]));

    const result = await tool.execute({});
    expect(result).toContain("## 2025-02-20 17:04 [discord:99]");
    expect(result).toContain("User: test input");
    expect(result).toContain("Assistant: test output");
  });

  it("omits channel when channelId is null", async () => {
    const tool = createReviewSessionsTool(makeListFn([
      { id: "a", input: "hi", output: "ok", channelId: null, createdAt: "2025-01-01T00:00:00Z" },
    ]));

    const result = await tool.execute({});
    expect(result).toContain("## 2025-01-01 00:00\n");
    expect(result).not.toContain("[]");
  });

  it("truncates long input at 200 chars", async () => {
    const longInput = "x".repeat(250);
    const tool = createReviewSessionsTool(makeListFn([
      { id: "a", input: longInput, output: "short", channelId: null, createdAt: "2025-01-01T00:00:00Z" },
    ]));

    const result = await tool.execute({});
    expect(result).toContain("x".repeat(200) + "...");
    expect(result).not.toContain("x".repeat(201) + ".");
  });

  it("truncates long output at 300 chars", async () => {
    const longOutput = "y".repeat(400);
    const tool = createReviewSessionsTool(makeListFn([
      { id: "a", input: "hi", output: longOutput, channelId: null, createdAt: "2025-01-01T00:00:00Z" },
    ]));

    const result = await tool.execute({});
    expect(result).toContain("y".repeat(300) + "...");
    expect(result).not.toContain("y".repeat(301) + ".");
  });

  it("shows (no output) for null output", async () => {
    const tool = createReviewSessionsTool(makeListFn([
      { id: "a", input: "test", output: null, channelId: null, createdAt: "2025-01-01T00:00:00Z" },
    ]));

    const result = await tool.execute({});
    expect(result).toContain("(no output)");
  });

  it("passes options through to listFn", async () => {
    const listFn = makeListFn([]);
    const tool = createReviewSessionsTool(listFn);

    await tool.execute({ channelId: "telegram:1", daysBack: 14, limit: 5 });

    expect(listFn).toHaveBeenCalledWith({
      channelId: "telegram:1",
      daysBack: 14,
      limit: 5,
    });
  });

  it("uses default daysBack of 7 in header", async () => {
    const tool = createReviewSessionsTool(makeListFn([
      { id: "a", input: "hi", output: "ok", channelId: null, createdAt: "2025-01-01T00:00:00Z" },
    ]));

    const result = await tool.execute({});
    expect(result).toContain("(7 days,");
  });
});
