import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @slack/bolt before importing the adapter
const mockPostMessage = vi.fn().mockResolvedValue({ ts: "1234567890.123456" });
const mockChatUpdate = vi.fn().mockResolvedValue({});
const mockAppStart = vi.fn().mockResolvedValue(undefined);
const mockAppStop = vi.fn().mockResolvedValue(undefined);

let messageHandler: (args: Record<string, unknown>) => Promise<void>;

vi.mock("@slack/bolt", () => ({
  App: vi.fn().mockImplementation(() => ({
    message: (handler: (args: Record<string, unknown>) => Promise<void>) => {
      messageHandler = handler;
    },
    client: {
      chat: {
        postMessage: mockPostMessage,
        update: mockChatUpdate,
      },
    },
    start: mockAppStart,
    stop: mockAppStop,
  })),
}));

import { SlackAdapter } from "../slack/slack-adapter.js";
import type { HandleMessageFn } from "@baseagent/gateway";

describe("SlackAdapter", () => {
  let adapter: SlackAdapter;
  let handleMessage: HandleMessageFn;

  beforeEach(() => {
    vi.clearAllMocks();
    handleMessage = vi.fn();
    adapter = new SlackAdapter("xoxb-test", "xapp-test", handleMessage);
  });

  describe("sendMessage", () => {
    it("calls chat.postMessage with correct channel and text", async () => {
      await adapter.sendMessage("slack:C012ABCDEF", "Hello!");

      expect(mockPostMessage).toHaveBeenCalledWith({
        channel: "C012ABCDEF",
        text: "Hello!",
      });
    });

    it("truncates messages over 4000 chars", async () => {
      const longText = "x".repeat(5000);

      await adapter.sendMessage("slack:C012ABCDEF", longText);

      const call = mockPostMessage.mock.calls[0][0] as { text: string };
      expect(call.text.length).toBeLessThanOrEqual(4000);
      expect(call.text.endsWith("...")).toBe(true);
    });

    it("does nothing for invalid channel ID", async () => {
      await adapter.sendMessage("invalid", "Hello!");

      expect(mockPostMessage).not.toHaveBeenCalled();
    });
  });

  describe("requestConfirmation", () => {
    it("sends prompt and resolves approved on 'yes'", async () => {
      const confirmPromise = adapter.requestConfirmation("slack:C012ABCDEF", "Approve?");

      // Let the postMessage mock resolve
      await vi.waitFor(() => {
        expect(mockPostMessage).toHaveBeenCalledWith({
          channel: "C012ABCDEF",
          text: "Approve?",
        });
      });

      // Simulate a "yes" reply via the message handler
      await messageHandler({
        message: { channel: "C012ABCDEF", user: "U123", text: "yes", ts: "111" },
        client: { chat: { postMessage: mockPostMessage, update: mockChatUpdate } },
      });

      const result = await confirmPromise;
      expect(result).toEqual({ approved: true, reason: undefined });
    });

    it("times out with approved: false", async () => {
      vi.useFakeTimers();
      try {
        const confirmPromise = adapter.requestConfirmation("slack:C012ABCDEF", "Approve?", 5000);

        // Let the postMessage mock resolve before advancing timers
        await Promise.resolve();
        await Promise.resolve();

        vi.advanceTimersByTime(6000);

        const result = await confirmPromise;
        expect(result).toEqual({ approved: false, reason: "Confirmation timed out" });
      } finally {
        vi.useRealTimers();
      }
    });

    it("returns error for invalid channel ID", async () => {
      const result = await adapter.requestConfirmation("invalid", "Approve?");

      expect(result).toEqual({ approved: false, reason: "Invalid channel ID" });
    });
  });

  describe("confirmation before rate limiting (bug fix)", () => {
    it("checks confirmations before allowlist/rate-limit", async () => {
      // Create adapter with restrictive allowlist (no users allowed)
      const restrictedAdapter = new SlackAdapter("xoxb-test", "xapp-test", handleMessage, ["allowed-user-only"]);

      // Start a confirmation request
      const confirmPromise = restrictedAdapter.requestConfirmation("slack:C012ABCDEF", "Approve?");

      await vi.waitFor(() => {
        expect(mockPostMessage).toHaveBeenCalled();
      });

      // Simulate a "yes" reply from a non-allowlisted user via the message handler
      // This should still resolve the confirmation (not be blocked by allowlist)
      await messageHandler({
        message: { channel: "C012ABCDEF", user: "non-allowed-user", text: "yes", ts: "111" },
        client: { chat: { postMessage: mockPostMessage, update: mockChatUpdate } },
      });

      const result = await confirmPromise;
      expect(result).toEqual({ approved: true, reason: undefined });
    });
  });

  describe("start / stop", () => {
    it("start() calls app.start()", async () => {
      await adapter.start();

      expect(mockAppStart).toHaveBeenCalled();
    });

    it("stop() calls app.stop()", async () => {
      await adapter.stop();

      expect(mockAppStop).toHaveBeenCalled();
    });
  });
});
