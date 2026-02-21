import { describe, expect, it } from "vitest";
import { parseOpenCodeModelRef, promptToText } from "../opencode-bridge.js";

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

describe("promptToText", () => {
  it("flattens text parts from multiple roles", () => {
    const prompt = [
      {
        role: "system",
        content: [{ type: "text", text: "Be concise." }],
      },
      {
        role: "user",
        content: [{ type: "text", text: "What changed?" }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "I updated the fallback order." }],
      },
    ];

    expect(promptToText(prompt)).toContain("system: Be concise.");
    expect(promptToText(prompt)).toContain("user: What changed?");
    expect(promptToText(prompt)).toContain("assistant: I updated the fallback order.");
  });
});
