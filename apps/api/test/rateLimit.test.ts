import { describe, expect, it } from "vitest";
import { isLockedOut, LOCKOUT_THRESHOLD, LOCKOUT_WINDOW_MS } from "../src/auth/rateLimit";

describe("isLockedOut", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");

  it("is not locked out with zero failed attempts", () => {
    expect(isLockedOut([], now)).toBe(false);
  });

  it("is not locked out just below the threshold", () => {
    const attempts = Array.from({ length: LOCKOUT_THRESHOLD - 1 }, () => now);
    expect(isLockedOut(attempts, now)).toBe(false);
  });

  it("is locked out at the threshold", () => {
    const attempts = Array.from({ length: LOCKOUT_THRESHOLD }, () => now);
    expect(isLockedOut(attempts, now)).toBe(true);
  });

  it("ignores attempts outside the lockout window", () => {
    const old = new Date(now.getTime() - LOCKOUT_WINDOW_MS - 1000);
    const attempts = Array.from({ length: LOCKOUT_THRESHOLD }, () => old);
    expect(isLockedOut(attempts, now)).toBe(false);
  });
});
