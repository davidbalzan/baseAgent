import { describe, expect, it } from "vitest";
import { parseOpenCodeModelRef, promptToText, splitPrompt } from "../opencode-bridge.js";

describe("parseOpenCodeModelRef", () => {
  it("parses provider/model format", () => {
    expect(parseOpenCodeModelRef("openai/gpt-5.3-codex", "openai")).toEqual({
      providerID: "openai",
      modelID: "gpt-5.3-codex",
    });
  });

  it("falls back to configured provider when model has no provider prefix", () => {
    expect(parseOpenCodeModelRef("gpt-5.3-codex", "openai")).toEqual({
      providerID: "openai",
      modelID: "gpt-5.3-codex",
    });
  });
});

describe("splitPrompt", () => {
  it("ignores system content and returns user message", () => {
    const prompt = [
      { role: "system", content: [{ type: "text", text: "Be concise." }] },
      { role: "user", content: [{ type: "text", text: "Hello" }] },
    ];

    const { system, user } = splitPrompt(prompt);
    expect(system).toBe("");
    expect(user).toContain("Current user message:\nHello");
  });

  it("puts conversation history in user text with capitalised labels", () => {
    const prompt = [
      { role: "system", content: [{ type: "text", text: "Be concise." }] },
      { role: "user", content: [{ type: "text", text: "What changed?" }] },
      { role: "assistant", content: [{ type: "text", text: "I updated the fallback order." }] },
      { role: "user", content: [{ type: "text", text: "Thanks, now fix the tests." }] },
    ];

    const { system, user } = splitPrompt(prompt);
    expect(system).toBe("");
    expect(user).toContain("User: What changed?");
    expect(user).toContain("Assistant: I updated the fallback order.");
    expect(user).toContain("Current user message:\nThanks, now fix the tests.");
    // Current message should NOT have a label
    expect(user).not.toMatch(/User: Thanks, now fix the tests\./);
  });

  it("returns empty strings for non-array input", () => {
    expect(splitPrompt(null)).toEqual({ system: "", user: "" });
    expect(splitPrompt("hello")).toEqual({ system: "", user: "" });
  });
});

describe("promptToText", () => {
  it("returns a user-focused payload without system prompt", () => {
    const prompt = [
      { role: "system", content: [{ type: "text", text: "Be concise." }] },
      { role: "user", content: [{ type: "text", text: "Hello" }] },
    ];

    const result = promptToText(prompt);
    expect(result).not.toContain("Be concise.");
    expect(result).toContain("Current user message:\nHello");
    expect(result).not.toContain("system:");
  });

  it("returns empty string for non-array input", () => {
    expect(promptToText(null)).toBe("");
    expect(promptToText("hello")).toBe("");
    expect(promptToText(42)).toBe("");
  });
});
