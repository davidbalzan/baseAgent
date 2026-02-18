import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  buildWebhookPrompt,
  isNoActionWebhookOutput,
  verifyWebhookSignature,
  createWebhookRoute,
  type RunSessionFn,
} from "../webhook.js";

describe("buildWebhookPrompt", () => {
  it("includes event name, ISO timestamp, and formatted payload", () => {
    const now = new Date("2026-02-18T14:30:00.000Z");
    const payload = { action: "opened", repo: "my-org/my-repo" };

    const prompt = buildWebhookPrompt("github.push", payload, now);

    expect(prompt).toContain("incoming webhook event");
    expect(prompt).toContain("github.push");
    expect(prompt).toContain("2026-02-18T14:30:00.000Z");
    expect(prompt).toContain('"action": "opened"');
    expect(prompt).toContain('"repo": "my-org/my-repo"');
  });

  it("includes instruction to reply 'No action needed'", () => {
    const prompt = buildWebhookPrompt("test", {}, new Date());
    expect(prompt).toContain("No action needed");
  });
});

describe("isNoActionWebhookOutput", () => {
  it("returns true for 'no action needed' variants", () => {
    expect(isNoActionWebhookOutput("No action needed.")).toBe(true);
    expect(isNoActionWebhookOutput("no action needed")).toBe(true);
    expect(isNoActionWebhookOutput("NO ACTION NEEDED")).toBe(true);
    expect(isNoActionWebhookOutput("All clear — no actions needed.")).toBe(true);
    expect(isNoActionWebhookOutput("  Nothing to do  ")).toBe(true);
    expect(isNoActionWebhookOutput("No webhook action needed at this time.")).toBe(true);
    expect(isNoActionWebhookOutput("No action required.")).toBe(true);
  });

  it("returns false for actionable output", () => {
    expect(isNoActionWebhookOutput("I processed the event and created an issue.")).toBe(false);
    expect(isNoActionWebhookOutput("Deployment triggered successfully.")).toBe(false);
    expect(isNoActionWebhookOutput("")).toBe(false);
  });
});

describe("verifyWebhookSignature", () => {
  const secret = "test-secret-key";
  const body = '{"action":"push"}';

  it("returns true for valid signature", () => {
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWebhookSignature(secret, signature, body)).toBe(true);
  });

  it("returns false for invalid signature", () => {
    expect(verifyWebhookSignature(secret, "invalid-signature", body)).toBe(false);
  });

  it("returns false for wrong secret", () => {
    const signature = createHmac("sha256", "wrong-secret").update(body).digest("hex");
    expect(verifyWebhookSignature(secret, signature, body)).toBe(false);
  });

  it("returns false for tampered body", () => {
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWebhookSignature(secret, signature, '{"action":"tampered"}')).toBe(false);
  });
});

describe("createWebhookRoute", () => {
  const mockConfig = {
    llm: { provider: "openrouter" as const, model: "test" },
    agent: { maxIterations: 10, timeoutMs: 120_000, costCapUsd: 1 },
    memory: {
      compactionThreshold: 4000,
      maxTokenBudget: 8000,
      toolOutputDecayIterations: 3,
      toolOutputDecayThresholdChars: 500,
    },
    server: { port: 3000, host: "0.0.0.0" },
    webhook: { enabled: true },
  };

  const mockSessionDeps = {} as any;

  it("calls runSession with correct prompt and channelId", async () => {
    const mockRunSession: RunSessionFn = vi.fn().mockResolvedValue({
      sessionId: "sess-1",
      output: "Processed the push event.",
      state: {
        totalTokens: 100,
        promptTokens: 80,
        completionTokens: 20,
        estimatedCostUsd: 0.01,
        iteration: 2,
        status: "completed",
      },
    });

    const app = createWebhookRoute({
      config: mockConfig,
      sessionDeps: mockSessionDeps,
      runSessionFn: mockRunSession,
    });

    const res = await app.request("/webhook/github.push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "push", ref: "refs/heads/main" }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.sessionId).toBe("sess-1");
    expect(json.event).toBe("github.push");
    expect(json.output).toBe("Processed the push event.");
    expect(json.usage.totalTokens).toBe(100);
    expect(json.status).toBe("completed");

    expect(mockRunSession).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("github.push"),
        channelId: "webhook:github.push",
      }),
      mockSessionDeps,
    );
  });

  it("returns full response shape with usage", async () => {
    const mockRunSession: RunSessionFn = vi.fn().mockResolvedValue({
      sessionId: "sess-2",
      output: "Done.",
      state: {
        totalTokens: 200,
        promptTokens: 150,
        completionTokens: 50,
        estimatedCostUsd: 0.05,
        iteration: 3,
        status: "completed",
      },
    });

    const app = createWebhookRoute({
      config: mockConfig,
      sessionDeps: mockSessionDeps,
      runSessionFn: mockRunSession,
    });

    const res = await app.request("/webhook/ci.deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "success" }),
    });

    const json = (await res.json()) as any;
    expect(json).toEqual({
      sessionId: "sess-2",
      event: "ci.deploy",
      output: "Done.",
      usage: {
        totalTokens: 200,
        promptTokens: 150,
        completionTokens: 50,
        estimatedCostUsd: 0.05,
        iterations: 3,
      },
      status: "completed",
    });
  });

  it("sends result to resultChannelId when output is actionable", async () => {
    const configWithChannel = {
      ...mockConfig,
      webhook: { enabled: true, resultChannelId: "telegram:123" },
    };
    const mockRunSession: RunSessionFn = vi.fn().mockResolvedValue({
      sessionId: "sess-3",
      output: "I found issues and created a ticket.",
      state: { totalTokens: 0, promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0, iteration: 1, status: "completed" },
    });
    const mockSendMessage = vi.fn().mockResolvedValue(undefined);

    const app = createWebhookRoute({
      config: configWithChannel,
      sessionDeps: mockSessionDeps,
      runSessionFn: mockRunSession,
      sendProactiveMessage: mockSendMessage,
    });

    await app.request("/webhook/alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ severity: "high" }),
    });

    expect(mockSendMessage).toHaveBeenCalledWith(
      "telegram:123",
      "I found issues and created a ticket.",
    );
  });

  it("suppresses channel notification when output is 'no action needed'", async () => {
    const configWithChannel = {
      ...mockConfig,
      webhook: { enabled: true, resultChannelId: "telegram:123" },
    };
    const mockRunSession: RunSessionFn = vi.fn().mockResolvedValue({
      sessionId: "sess-4",
      output: "No action needed.",
      state: { totalTokens: 0, promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0, iteration: 1, status: "completed" },
    });
    const mockSendMessage = vi.fn();

    const app = createWebhookRoute({
      config: configWithChannel,
      sessionDeps: mockSessionDeps,
      runSessionFn: mockRunSession,
      sendProactiveMessage: mockSendMessage,
    });

    await app.request("/webhook/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "ping" }),
    });

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("returns 401 when secret configured but signature missing", async () => {
    const configWithSecret = {
      ...mockConfig,
      webhook: { enabled: true, secret: "my-secret" },
    };
    const mockRunSession: RunSessionFn = vi.fn();

    const app = createWebhookRoute({
      config: configWithSecret,
      sessionDeps: mockSessionDeps,
      runSessionFn: mockRunSession,
    });

    const res = await app.request("/webhook/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "test" }),
    });

    expect(res.status).toBe(401);
    const json = (await res.json()) as any;
    expect(json.error).toContain("Missing X-Webhook-Signature");
    expect(mockRunSession).not.toHaveBeenCalled();
  });

  it("returns 401 when secret configured but signature invalid", async () => {
    const configWithSecret = {
      ...mockConfig,
      webhook: { enabled: true, secret: "my-secret" },
    };
    const mockRunSession: RunSessionFn = vi.fn();

    const app = createWebhookRoute({
      config: configWithSecret,
      sessionDeps: mockSessionDeps,
      runSessionFn: mockRunSession,
    });

    const res = await app.request("/webhook/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": "bad-signature",
      },
      body: JSON.stringify({ data: "test" }),
    });

    expect(res.status).toBe(401);
    const json = (await res.json()) as any;
    expect(json.error).toContain("Invalid webhook signature");
    expect(mockRunSession).not.toHaveBeenCalled();
  });

  it("accepts request with valid signature", async () => {
    const secret = "my-secret";
    const configWithSecret = {
      ...mockConfig,
      webhook: { enabled: true, secret },
    };
    const mockRunSession: RunSessionFn = vi.fn().mockResolvedValue({
      sessionId: "sess-sig",
      output: "Handled.",
      state: { totalTokens: 0, promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0, iteration: 1, status: "completed" },
    });

    const app = createWebhookRoute({
      config: configWithSecret,
      sessionDeps: mockSessionDeps,
      runSessionFn: mockRunSession,
    });

    const body = JSON.stringify({ data: "signed" });
    const signature = createHmac("sha256", secret).update(body).digest("hex");

    const res = await app.request("/webhook/secure", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
      },
      body,
    });

    expect(res.status).toBe(200);
    expect(mockRunSession).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for invalid JSON body", async () => {
    const mockRunSession: RunSessionFn = vi.fn();

    const app = createWebhookRoute({
      config: mockConfig,
      sessionDeps: mockSessionDeps,
      runSessionFn: mockRunSession,
    });

    const res = await app.request("/webhook/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    expect(res.status).toBe(400);
    expect(mockRunSession).not.toHaveBeenCalled();
  });

  it("returns 400 for non-object payload (array)", async () => {
    const mockRunSession: RunSessionFn = vi.fn();

    const app = createWebhookRoute({
      config: mockConfig,
      sessionDeps: mockSessionDeps,
      runSessionFn: mockRunSession,
    });

    const res = await app.request("/webhook/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([1, 2, 3]),
    });

    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.error).toContain("JSON object");
    expect(mockRunSession).not.toHaveBeenCalled();
  });
});
