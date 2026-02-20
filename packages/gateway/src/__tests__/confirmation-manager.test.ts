import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createConfirmationManager } from "../confirmation-manager.js";

describe("createConfirmationManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves approved on 'yes'", async () => {
    const cm = createConfirmationManager();
    const promise = cm.request("chat1");

    cm.tryResolve("chat1", "yes");
    const result = await promise;

    expect(result).toEqual({ approved: true, reason: undefined });
  });

  it("resolves approved on 'y'", async () => {
    const cm = createConfirmationManager();
    const promise = cm.request("chat1");

    cm.tryResolve("chat1", "y");
    const result = await promise;

    expect(result).toEqual({ approved: true, reason: undefined });
  });

  it("resolves denied on 'no'", async () => {
    const cm = createConfirmationManager();
    const promise = cm.request("chat1");

    cm.tryResolve("chat1", "no");
    const result = await promise;

    expect(result).toEqual({ approved: false, reason: "User replied: no" });
  });

  it("times out with approved: false", async () => {
    const cm = createConfirmationManager(5000);
    const promise = cm.request("chat1");

    vi.advanceTimersByTime(6000);
    const result = await promise;

    expect(result).toEqual({ approved: false, reason: "Confirmation timed out" });
  });

  it("tryResolve returns false when no pending confirmation", () => {
    const cm = createConfirmationManager();
    expect(cm.tryResolve("chat1", "yes")).toBe(false);
  });

  it("tryResolve returns true when pending confirmation exists", async () => {
    const cm = createConfirmationManager();
    cm.request("chat1");

    expect(cm.tryResolve("chat1", "yes")).toBe(true);
  });

  it("hasPending returns correct status", () => {
    const cm = createConfirmationManager();

    expect(cm.hasPending("chat1")).toBe(false);
    cm.request("chat1");
    expect(cm.hasPending("chat1")).toBe(true);
  });

  it("clearAll resolves all pending with cleared reason", async () => {
    const cm = createConfirmationManager();
    const promise1 = cm.request("chat1");
    const promise2 = cm.request("chat2");

    cm.clearAll();

    const result1 = await promise1;
    const result2 = await promise2;

    expect(result1).toEqual({ approved: false, reason: "Confirmation cleared" });
    expect(result2).toEqual({ approved: false, reason: "Confirmation cleared" });
    expect(cm.hasPending("chat1")).toBe(false);
    expect(cm.hasPending("chat2")).toBe(false);
  });

  it("supersedes existing confirmation for same key", async () => {
    const cm = createConfirmationManager();
    const promise1 = cm.request("chat1");
    const promise2 = cm.request("chat1");

    const result1 = await promise1;
    expect(result1).toEqual({ approved: false, reason: "Superseded by new confirmation request" });

    cm.tryResolve("chat1", "yes");
    const result2 = await promise2;
    expect(result2).toEqual({ approved: true, reason: undefined });
  });
});
