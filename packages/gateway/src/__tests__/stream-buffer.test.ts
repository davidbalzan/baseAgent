import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStreamBuffer } from "../stream-buffer.js";

describe("createStreamBuffer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accumulates text deltas", async () => {
    const editMessage = vi.fn().mockResolvedValue(undefined);
    const handle = createStreamBuffer(
      { maxLength: 4096, editIntervalMs: 500 },
      editMessage,
    );

    handle.callbacks.onTextDelta("Hello ");
    handle.callbacks.onTextDelta("world");
    handle.start();

    vi.advanceTimersByTime(500);
    await vi.waitFor(() => {
      expect(editMessage).toHaveBeenCalledWith("Hello world");
    });

    handle.cleanup();
  });

  it("shows tool status with underscore style by default", async () => {
    const editMessage = vi.fn().mockResolvedValue(undefined);
    const handle = createStreamBuffer(
      { maxLength: 4096, editIntervalMs: 500 },
      editMessage,
    );

    handle.callbacks.onTextDelta("Processing...");
    handle.callbacks.onToolCall("shell_exec");
    handle.start();

    vi.advanceTimersByTime(500);
    await vi.waitFor(() => {
      expect(editMessage).toHaveBeenCalledWith("Processing...\n\n_Using shell_exec..._");
    });

    handle.cleanup();
  });

  it("shows tool status with asterisk style when configured", async () => {
    const editMessage = vi.fn().mockResolvedValue(undefined);
    const handle = createStreamBuffer(
      { maxLength: 4096, editIntervalMs: 500 },
      editMessage,
      { toolStatusStyle: "asterisk" },
    );

    handle.callbacks.onTextDelta("Processing...");
    handle.callbacks.onToolCall("shell_exec");
    handle.start();

    vi.advanceTimersByTime(500);
    await vi.waitFor(() => {
      expect(editMessage).toHaveBeenCalledWith("Processing...\n\n*Using shell_exec...*");
    });

    handle.cleanup();
  });

  it("truncates text exceeding maxLength", async () => {
    const editMessage = vi.fn().mockResolvedValue(undefined);
    const handle = createStreamBuffer(
      { maxLength: 20, editIntervalMs: 500 },
      editMessage,
    );

    handle.callbacks.onTextDelta("This is a very long text that exceeds the max length");
    handle.start();

    vi.advanceTimersByTime(500);
    await vi.waitFor(() => {
      const call = editMessage.mock.calls[0][0] as string;
      expect(call.length).toBeLessThanOrEqual(20);
      expect(call.endsWith("...")).toBe(true);
    });

    handle.cleanup();
  });

  it("onFinish replaces buffer and does final edit", async () => {
    const editMessage = vi.fn().mockResolvedValue(undefined);
    const handle = createStreamBuffer(
      { maxLength: 4096, editIntervalMs: 500 },
      editMessage,
    );

    handle.callbacks.onTextDelta("partial");
    handle.start();
    handle.callbacks.onFinish("Final output");

    await vi.waitFor(() => {
      expect(editMessage).toHaveBeenCalledWith("Final output");
    });
  });

  it("onError sets error message and does final edit", async () => {
    const editMessage = vi.fn().mockResolvedValue(undefined);
    const handle = createStreamBuffer(
      { maxLength: 4096, editIntervalMs: 500 },
      editMessage,
    );

    handle.callbacks.onTextDelta("partial");
    handle.start();
    handle.callbacks.onError(new Error("Something went wrong"));

    await vi.waitFor(() => {
      expect(editMessage).toHaveBeenCalledWith("Error: Something went wrong");
    });
  });

  it("sends typing indicators when configured", () => {
    const editMessage = vi.fn().mockResolvedValue(undefined);
    const sendTyping = vi.fn();
    const handle = createStreamBuffer(
      { maxLength: 4096, editIntervalMs: 500 },
      editMessage,
      { sendTyping, typingIntervalMs: 4000 },
    );

    handle.start();

    // Initial typing call
    expect(sendTyping).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(4000);
    expect(sendTyping).toHaveBeenCalledTimes(2);

    handle.cleanup();
  });

  it("does not edit when text hasn't changed", async () => {
    const editMessage = vi.fn().mockResolvedValue(undefined);
    const handle = createStreamBuffer(
      { maxLength: 4096, editIntervalMs: 500 },
      editMessage,
    );

    handle.callbacks.onTextDelta("Hello");
    handle.start();

    vi.advanceTimersByTime(500);
    await vi.waitFor(() => {
      expect(editMessage).toHaveBeenCalledTimes(1);
    });

    // Advance again without new text
    vi.advanceTimersByTime(500);
    // Should still be 1 call since text didn't change
    expect(editMessage).toHaveBeenCalledTimes(1);

    handle.cleanup();
  });
});
