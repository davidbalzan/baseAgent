import { describe, it, expect } from "vitest";
import {
  buildConversationHistory,
  formatSessionDate,
  BOUNDARY_MARKER,
} from "../conversation-history.js";

describe("formatSessionDate", () => {
  it("formats ISO date to 'Mon D, HH:MM' in UTC", () => {
    expect(formatSessionDate("2025-02-20T17:04:00.000Z")).toBe("Feb 20, 17:04");
  });

  it("handles midnight correctly", () => {
    expect(formatSessionDate("2025-01-01T00:00:00.000Z")).toBe("Jan 1, 00:00");
  });

  it("handles end of year", () => {
    expect(formatSessionDate("2025-12-31T23:59:00.000Z")).toBe("Dec 31, 23:59");
  });

  it("pads single-digit hours and minutes", () => {
    expect(formatSessionDate("2025-06-05T03:07:00.000Z")).toBe("Jun 5, 03:07");
  });
});

describe("buildConversationHistory", () => {
  const sessions = [
    { input: "newest message", output: "newest reply", createdAt: "2025-02-21T10:00:00.000Z" },
    { input: "older message", output: "older reply", createdAt: "2025-02-20T17:04:00.000Z" },
    { input: "oldest message", output: "oldest reply", createdAt: "2025-02-19T08:00:00.000Z" },
  ];

  it("returns undefined when no sessions have output", () => {
    const noOutput = [{ input: "hello", output: null, createdAt: "2025-01-01T00:00:00Z" }];
    expect(buildConversationHistory(noOutput, 10000)).toBeUndefined();
  });

  it("returns undefined when empty array is passed", () => {
    expect(buildConversationHistory([], 10000)).toBeUndefined();
  });

  it("includes [Previous conversation] headers with dates", () => {
    const result = buildConversationHistory(sessions, 10000)!;
    expect(result).toBeDefined();

    // Find user messages with headers
    const headerMessages = result.filter(
      (m) => m.role === "user" && typeof m.content === "string" && m.content.startsWith("[Previous conversation"),
    );
    expect(headerMessages.length).toBeGreaterThanOrEqual(1);

    // First header should be oldest (chronological order)
    expect(headerMessages[0].content).toContain("Feb 19");
  });

  it("appends boundary marker to the last assistant message", () => {
    const result = buildConversationHistory(sessions, 10000)!;
    const lastMsg = result[result.length - 1];

    // Last message should be an assistant message with the boundary appended
    expect(lastMsg.role).toBe("assistant");
    expect(lastMsg.content).toContain(BOUNDARY_MARKER);
    // Should also still contain the original reply content
    expect(lastMsg.content).toContain("newest reply");
  });

  it("does not create a fake user+assistant boundary pair", () => {
    const result = buildConversationHistory(sessions, 10000)!;

    // There should be no user message containing the boundary text
    const boundaryUserMsgs = result.filter(
      (m) => m.role === "user" && typeof m.content === "string" && m.content.includes("End of conversation history"),
    );
    expect(boundaryUserMsgs).toHaveLength(0);
  });

  it("produces chronological order (oldest first)", () => {
    const result = buildConversationHistory(sessions, 10000)!;

    // Extract header dates (user messages)
    const headers = result
      .filter((m) => m.role === "user" && typeof m.content === "string" && m.content.startsWith("[Previous"))
      .map((m) => m.content as string);

    // Oldest should come first
    expect(headers[0]).toContain("Feb 19");
    expect(headers[headers.length - 1]).toContain("Feb 21");
  });

  it("respects token budget and drops sessions that don't fit", () => {
    // Each session is roughly (input + output + 50 overhead) / 4 tokens
    // "newest message" + "newest reply" + 50 ~ 80 chars ~ 20 tokens
    // Boundary marker is ~20 tokens
    // With a very tight budget, only 1 session should fit
    const result = buildConversationHistory(sessions, 45)!;

    // Should have: 1 header+input, 1 assistant (with boundary appended) = 2 messages
    expect(result).toHaveLength(2);
  });

  it("returns undefined when budget is too small for even one session + boundary", () => {
    // Budget of 1 can't even fit the boundary marker overhead + one session
    expect(buildConversationHistory(sessions, 1)).toBeUndefined();
  });

  it("skips sessions with null output", () => {
    const mixed = [
      { input: "has output", output: "yes", createdAt: "2025-02-21T10:00:00.000Z" },
      { input: "no output", output: null, createdAt: "2025-02-20T10:00:00.000Z" },
    ];

    const result = buildConversationHistory(mixed, 10000)!;
    // 1 session pair (2 messages: user + assistant with boundary) = 2
    expect(result).toHaveLength(2);
  });

  it("wraps input with header and 'User:' prefix", () => {
    const result = buildConversationHistory(
      [{ input: "hello world", output: "hi", createdAt: "2025-06-15T12:30:00.000Z" }],
      10000,
    )!;

    const userMsg = result[0];
    expect(userMsg.role).toBe("user");
    expect(userMsg.content).toContain("[Previous conversation — Jun 15, 12:30]");
    expect(userMsg.content).toContain("User: hello world");
  });

  it("ends with assistant role (not user)", () => {
    const result = buildConversationHistory(sessions, 10000)!;
    // The last message should always be assistant — no dangling user turn
    expect(result[result.length - 1].role).toBe("assistant");
  });

  it("filters out sessions before the 'after' timestamp", () => {
    // Only the newest session (Feb 21) should survive when after = Feb 20 18:00
    const result = buildConversationHistory(sessions, 10000, {
      after: "2025-02-20T18:00:00.000Z",
    })!;

    expect(result).toHaveLength(2); // 1 user + 1 assistant
    expect(result[0].content).toContain("newest message");
  });

  it("returns undefined when all sessions are before 'after'", () => {
    const result = buildConversationHistory(sessions, 10000, {
      after: "2025-12-01T00:00:00.000Z",
    });
    expect(result).toBeUndefined();
  });

  it("includes all sessions when 'after' is not provided", () => {
    const result = buildConversationHistory(sessions, 10000)!;
    // All 3 sessions → 6 messages
    expect(result).toHaveLength(6);
  });
});
