import { describe, it, expect, vi } from "vitest";
import { createDashboardApi } from "../dashboard-api.js";

describe("createDashboardApi", () => {
  const mockSession = {
    id: "sess-1",
    status: "completed",
    channelId: "telegram:123",
    input: "Hello agent",
    output: "Hello user",
    totalTokens: 200,
    promptTokens: 150,
    completionTokens: 50,
    totalCostUsd: 0.01,
    iterations: 2,
    createdAt: "2026-02-18T14:00:00.000Z",
    updatedAt: "2026-02-18T14:01:00.000Z",
  };

  const mockTraces = [
    {
      id: "t-1",
      sessionId: "sess-1",
      phase: "session_start",
      iteration: 0,
      data: JSON.stringify({ input: "Hello agent" }),
      promptTokens: null,
      completionTokens: null,
      costUsd: null,
      timestamp: "2026-02-18T14:00:00.000Z",
    },
    {
      id: "t-2",
      sessionId: "sess-1",
      phase: "reason",
      iteration: 1,
      data: JSON.stringify({ text: "Thinking...", toolCallCount: 0 }),
      promptTokens: 100,
      completionTokens: 30,
      costUsd: 0.005,
      timestamp: "2026-02-18T14:00:01.000Z",
    },
  ];

  const mockSessionRepo = {
    listRecent: vi.fn().mockReturnValue([mockSession]),
    findById: vi.fn().mockImplementation((id: string) =>
      id === "sess-1" ? mockSession : undefined,
    ),
  } as any;

  const mockTraceRepo = {
    findBySession: vi.fn().mockReturnValue(mockTraces),
  } as any;

  const app = createDashboardApi({
    sessionRepo: mockSessionRepo,
    traceRepo: mockTraceRepo,
    workspacePath: "/tmp/test-workspace",
    getModelStatus: () => ({
      fallbackCooldownMs: 1_800_000,
      fallbackCooldownReasons: ["quota-window", "rate-limit"],
      chain: [
        {
          index: 0,
          provider: "anthropic",
          modelId: "claude-opus-4-20250514",
          inCooldown: false,
          cooldownUntil: null,
          cooldownRemainingMs: 0,
        },
      ],
    }),
  });

  it("GET /api/sessions returns session list", async () => {
    const res = await app.request("/api/sessions");
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0].id).toBe("sess-1");
  });

  it("GET /api/sessions respects limit param", async () => {
    await app.request("/api/sessions?limit=10");
    expect(mockSessionRepo.listRecent).toHaveBeenCalledWith(10);
  });

  it("GET /api/sessions caps limit at 100", async () => {
    await app.request("/api/sessions?limit=999");
    expect(mockSessionRepo.listRecent).toHaveBeenCalledWith(100);
  });

  it("GET /api/sessions/:id returns session detail", async () => {
    const res = await app.request("/api/sessions/sess-1");
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.session.id).toBe("sess-1");
    expect(json.session.status).toBe("completed");
  });

  it("GET /api/sessions/:id returns 404 for unknown session", async () => {
    const res = await app.request("/api/sessions/unknown");
    expect(res.status).toBe(404);
  });

  it("GET /api/sessions/:id/traces returns parsed trace events", async () => {
    const res = await app.request("/api/sessions/sess-1/traces");
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.traces).toHaveLength(2);
    // Data should be parsed from JSON string
    expect(json.traces[0].data.input).toBe("Hello agent");
    expect(json.traces[1].data.text).toBe("Thinking...");
    expect(json.traces[1].promptTokens).toBe(100);
  });

  it("GET /api/sessions/:id/traces returns sorted by timestamp", async () => {
    const res = await app.request("/api/sessions/sess-1/traces");
    const json = (await res.json()) as any;
    const timestamps = json.traces.map((t: any) => t.timestamp);
    expect(timestamps).toEqual([...timestamps].sort());
  });

  it("GET /api/sessions/:id/traces returns 404 for unknown session", async () => {
    const res = await app.request("/api/sessions/unknown/traces");
    expect(res.status).toBe(404);
  });

  it("GET /api/model/status returns model chain status", async () => {
    const res = await app.request("/api/model/status");
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.available).toBe(true);
    expect(json.fallbackCooldownMs).toBe(1_800_000);
    expect(json.fallbackCooldownReasons).toEqual(["quota-window", "rate-limit"]);
    expect(json.chain).toHaveLength(1);
    expect(json.chain[0].provider).toBe("anthropic");
  });
});
