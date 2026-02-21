import { describe, it, expect, vi } from "vitest";
import { createSessionSearchTool, type SessionSearchFn } from "../built-in/session-search.tool.js";

function makeSearchFn(results: ReturnType<SessionSearchFn> = []): SessionSearchFn {
  return vi.fn(() => results);
}

describe("createSessionSearchTool", () => {
  it("has correct name and permission", () => {
    const tool = createSessionSearchTool(makeSearchFn());
    expect(tool.name).toBe("session_search");
    expect(tool.permission).toBe("read");
  });

  it("returns no-results message when search is empty", async () => {
    const tool = createSessionSearchTool(makeSearchFn([]));
    const result = await tool.execute({ query: "unicorn" });
    expect(result).toContain('No past conversations found matching "unicorn"');
  });

  it("formats results with date, channel, and truncated content", async () => {
    const tool = createSessionSearchTool(makeSearchFn([
      {
        id: "abc-123",
        input: "show me a cat",
        output: "Here is a cat picture for you.",
        channelId: "telegram:42",
        createdAt: "2025-02-20T17:04:00.000Z",
      },
    ]));

    const result = await tool.execute({ query: "cat" });
    expect(result).toContain('Found 1 conversation(s) matching "cat"');
    expect(result).toContain("[2025-02-20 17:04]");
    expect(result).toContain("[telegram:42]");
    expect(result).toContain("(abc-123)");
    expect(result).toContain("User: show me a cat");
    expect(result).toContain("Assistant: Here is a cat picture for you.");
  });

  it("truncates long input at 100 chars", async () => {
    const longInput = "x".repeat(150);
    const tool = createSessionSearchTool(makeSearchFn([
      { id: "id1", input: longInput, output: "short", channelId: null, createdAt: "2025-01-01T00:00:00Z" },
    ]));

    const result = await tool.execute({ query: "x" });
    expect(result).toContain("x".repeat(100) + "...");
    expect(result).not.toContain("x".repeat(101));
  });

  it("truncates long output at 200 chars", async () => {
    const longOutput = "y".repeat(300);
    const tool = createSessionSearchTool(makeSearchFn([
      { id: "id1", input: "hi", output: longOutput, channelId: null, createdAt: "2025-01-01T00:00:00Z" },
    ]));

    const result = await tool.execute({ query: "hi" });
    expect(result).toContain("y".repeat(200) + "...");
    expect(result).not.toContain("y".repeat(201));
  });

  it("shows (no output) for null output", async () => {
    const tool = createSessionSearchTool(makeSearchFn([
      { id: "id1", input: "test", output: null, channelId: null, createdAt: "2025-01-01T00:00:00Z" },
    ]));

    const result = await tool.execute({ query: "test" });
    expect(result).toContain("(no output)");
  });

  it("omits channel tag when channelId is null", async () => {
    const tool = createSessionSearchTool(makeSearchFn([
      { id: "id1", input: "test", output: "ok", channelId: null, createdAt: "2025-01-01T00:00:00Z" },
    ]));

    const result = await tool.execute({ query: "test" });
    // Should have date then id directly, no channel bracket
    expect(result).toMatch(/\[2025-01-01 00:00\] \(id1\)/);
  });

  it("passes options through to searchFn", async () => {
    const searchFn = makeSearchFn([]);
    const tool = createSessionSearchTool(searchFn);

    await tool.execute({ query: "test", channelId: "discord:1", daysBack: 7, limit: 5 });

    expect(searchFn).toHaveBeenCalledWith("test", {
      channelId: "discord:1",
      daysBack: 7,
      limit: 5,
    });
  });
});
