import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  buildWebhookPrompt,
  isNoActionWebhookOutput,
  verifyWebhookSignature,
  createWebhookRoute,
} from "@baseagent/plugin-webhook/webhook";

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
  it("calls runSession with correct prompt and channelId", async () => {
    const mockRunSession = vi.fn().mockResolvedValue({
      sessionId: "sess-1",
      output: "Processed the push event.",
    });

    const app = createWebhookRoute({ runSession: mockRunSession });

    const res = await app.request("/webhook/github.push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "push", ref: "refs/heads/main" }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.sessionId).toBe("sess-1");
    expect(json.event).toBe("github.push");
    expect(json.output).toBe("Processed the push event.");

    expect(mockRunSession).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("github.push"),
        channelId: "webhook:github.push",
      }),
    );
  });

  it("sends result to resultChannelId when output is actionable", async () => {
    const mockRunSession = vi.fn().mockResolvedValue({
      sessionId: "sess-3",
      output: "I found issues and created a ticket.",
    });
    const mockSendMessage = vi.fn().mockResolvedValue(undefined);

    const app = createWebhookRoute({
      resultChannelId: "telegram:123",
      runSession: mockRunSession,
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
    const mockRunSession = vi.fn().mockResolvedValue({
      sessionId: "sess-4",
      output: "No action needed.",
    });
    const mockSendMessage = vi.fn();

    const app = createWebhookRoute({
      resultChannelId: "telegram:123",
      runSession: mockRunSession,
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
    const mockRunSession = vi.fn();
    const app = createWebhookRoute({ secret: "my-secret", runSession: mockRunSession });

    const res = await app.request("/webhook/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "test" }),
    });

    expect(res.status).toBe(401);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.error).toContain("Missing X-Webhook-Signature");
    expect(mockRunSession).not.toHaveBeenCalled();
  });

  it("returns 401 when secret configured but signature invalid", async () => {
    const mockRunSession = vi.fn();
    const app = createWebhookRoute({ secret: "my-secret", runSession: mockRunSession });

    const res = await app.request("/webhook/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": "bad-signature",
      },
      body: JSON.stringify({ data: "test" }),
    });

    expect(res.status).toBe(401);
    expect(mockRunSession).not.toHaveBeenCalled();
  });

  it("accepts request with valid signature", async () => {
    const secret = "my-secret";
    const mockRunSession = vi.fn().mockResolvedValue({
      sessionId: "sess-sig",
      output: "Handled.",
    });
    const app = createWebhookRoute({ secret, runSession: mockRunSession });

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
    const mockRunSession = vi.fn();
    const app = createWebhookRoute({ runSession: mockRunSession });

    const res = await app.request("/webhook/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    expect(res.status).toBe(400);
    expect(mockRunSession).not.toHaveBeenCalled();
  });

  it("returns 400 for non-object payload (array)", async () => {
    const mockRunSession = vi.fn();
    const app = createWebhookRoute({ runSession: mockRunSession });

    const res = await app.request("/webhook/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([1, 2, 3]),
    });

    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.error).toContain("JSON object");
    expect(mockRunSession).not.toHaveBeenCalled();
  });
});
