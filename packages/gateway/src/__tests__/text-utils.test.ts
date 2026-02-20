import { describe, it, expect } from "vitest";
import { truncateText, extractChannelId } from "../text-utils.js";

describe("truncateText", () => {
  it("returns text unchanged when under maxLength", () => {
    expect(truncateText("hello", 10)).toBe("hello");
  });

  it("returns text unchanged when exactly maxLength", () => {
    expect(truncateText("hello", 5)).toBe("hello");
  });

  it("truncates and appends ... when over maxLength", () => {
    const result = truncateText("hello world", 8);
    expect(result).toBe("hello...");
    expect(result.length).toBe(8);
  });

  it("handles empty string", () => {
    expect(truncateText("", 10)).toBe("");
  });
});

describe("extractChannelId", () => {
  it("extracts ID from telegram channel", () => {
    expect(extractChannelId("telegram:12345")).toBe("12345");
  });

  it("extracts ID from discord channel", () => {
    expect(extractChannelId("discord:C012ABCDEF")).toBe("C012ABCDEF");
  });

  it("extracts ID from slack channel", () => {
    expect(extractChannelId("slack:C012ABCDEF")).toBe("C012ABCDEF");
  });

  it("returns undefined for ID without colon", () => {
    expect(extractChannelId("invalid")).toBeUndefined();
  });

  it("returns undefined for empty ID after colon", () => {
    expect(extractChannelId("telegram:")).toBeUndefined();
  });
});
