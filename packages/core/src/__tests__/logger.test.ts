import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLogger } from "../logger.js";

describe("createLogger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("log() writes to console.log with colored tag", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = createLogger("test");
    logger.log("hello");
    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("[test]");
    expect(output).toContain("hello");
  });

  it("warn() writes to console.warn", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logger = createLogger("test-warn");
    logger.warn("careful");
    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("[test-warn]");
    expect(output).toContain("careful");
  });

  it("error() writes to console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = createLogger("test-error");
    logger.error("oh no");
    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("[test-error]");
    expect(output).toContain("oh no");
  });

  it("same name gets same color", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const a = createLogger("same");
    const b = createLogger("same");
    a.log("x");
    b.log("y");
    const outA = spy.mock.calls[0][0] as string;
    const outB = spy.mock.calls[1][0] as string;
    // Extract the color code (first few chars before [same])
    const colorA = outA.split("[same]")[0];
    const colorB = outB.split("[same]")[0];
    expect(colorA).toBe(colorB);
  });

  it("different names get colors from palette", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    // Just verify it doesn't throw for many names
    for (let i = 0; i < 15; i++) {
      const logger = createLogger(`module-${i}`);
      logger.log("test");
    }
  });
});
