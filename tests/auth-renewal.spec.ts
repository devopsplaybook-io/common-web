import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthService,
  SESSION_RENEWAL_CHECK_INTERVAL_MS,
} from "@devopsplaybook.io/common-web/services/AuthService";

describe("AuthService.startSessionRenewal", () => {
  let stop: (() => void) | null = null;

  beforeEach(() => {
    stop = null;
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stop?.();
    stop = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function track(): { calls: () => number } {
    let count = 0;
    vi.spyOn(AuthService, "getToken").mockImplementation(async () => {
      count += 1;
      return null;
    });
    return { calls: () => count };
  }

  it("checks the token immediately when started", async () => {
    const counter = track();

    stop = AuthService.startSessionRenewal();

    expect(counter.calls()).toBe(1);
  });

  it("renews on a visible visibilitychange and ignores a hidden one", async () => {
    const counter = track();
    stop = AuthService.startSessionRenewal();
    const visibility = vi.spyOn(document, "visibilityState", "get");

    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(counter.calls()).toBe(1);

    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(counter.calls()).toBe(2);
  });

  it("renews on window focus", () => {
    const counter = track();
    stop = AuthService.startSessionRenewal();

    window.dispatchEvent(new Event("focus"));

    expect(counter.calls()).toBe(2);
  });

  it("polls at the configured interval", () => {
    const counter = track();
    stop = AuthService.startSessionRenewal({ intervalMs: 1000 });

    vi.advanceTimersByTime(1000);
    expect(counter.calls()).toBe(2);
    vi.advanceTimersByTime(2000);
    expect(counter.calls()).toBe(4);
  });

  it("uses the five-minute default when the interval is missing or invalid", () => {
    const counter = track();
    stop = AuthService.startSessionRenewal({ intervalMs: 0 });

    vi.advanceTimersByTime(SESSION_RENEWAL_CHECK_INTERVAL_MS - 1);
    expect(counter.calls()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(counter.calls()).toBe(2);
  });

  it("removes its listeners and interval when stopped", () => {
    const counter = track();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("visible");
    stop = AuthService.startSessionRenewal({ intervalMs: 1000 });

    stop();

    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(5000);

    expect(counter.calls()).toBe(1);
  });

  it("returns the existing stop function on a second start without duplicating listeners", () => {
    const counter = track();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("visible");

    const first = AuthService.startSessionRenewal({ intervalMs: 1000 });
    const second = AuthService.startSessionRenewal({ intervalMs: 1000 });

    expect(second).toBe(first);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(counter.calls()).toBe(2);

    stop = second;
  });

  it("allows stopping twice", () => {
    stop = AuthService.startSessionRenewal();

    expect(() => {
      stop?.();
      stop?.();
    }).not.toThrow();
  });

  it("is a no-op during SSR", () => {
    const counter = track();
    vi.stubGlobal("window", undefined);

    const noop = AuthService.startSessionRenewal();

    expect(counter.calls()).toBe(0);
    expect(() => noop()).not.toThrow();
  });

  it("is a no-op when document is missing", () => {
    const counter = track();
    vi.stubGlobal("document", undefined);

    const noop = AuthService.startSessionRenewal();

    expect(counter.calls()).toBe(0);
    expect(() => noop()).not.toThrow();
  });

  it("swallows a rejected renewal check", async () => {
    vi.spyOn(AuthService, "getToken").mockRejectedValue(new Error("offline"));

    expect(() => {
      stop = AuthService.startSessionRenewal();
    }).not.toThrow();
    await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0));
  });
});
